import ExploreScene from './explore'
import AchievementScene from './achievements'
import ShopScene from './shop'
import {
  ROSTER,
  SPECIAL_CATS,
  isUnlocked,
  unlockedCount,
  ownsSpecialCat,
  setActiveCatId,
  getActiveCatId
} from '../data/cats'
import {
  preloadCatArt,
  getCatSprite,
  getLockedSprite,
  drawCatPlaceholder
} from '../render/catArt'
import { THEME } from '../core/theme'
import { sfx, getBgmVol, getSfxVol, setBgmVol, setSfxVol } from '../core/audio'
import { clamp, lerp, rand, roundRectPath } from '../core/util'

const COLS = 4

/**
 * 收集区 · 图鉴
 * 网格卡片：已解锁显示真实配色+花纹，未解锁显示灰色剪影。
 * 猫立绘在进入时全部预渲染为离屏 sprite，帧循环只 drawImage。
 */
export default class CodexScene {
  constructor(view) {
    this.view = view
    this.time = 0

    // 纵向滚动状态必须在 _computeLayout() 之前初始化为 0：
    // _computeLayout 内部会算出 maxScroll；若之后再赋 0 会把它永久覆盖，
    // 滚动被钳死在 [0,0]（卡片可见但滑不动）。
    this.scrollY = 0
    this.maxScroll = 0
    this.vel = 0 // 松手惯性 px/ms
    this.drag = null

    this._computeLayout()
    preloadCatArt() // 立绘是灰度图异步加载，rAF 渲染会自动等就绪
    this._initBubbles()

    this.press = { i: -1, t: 0 } // 卡片点按回弹动画
    this.toast = { text: '', t: 9999 }

    this.audioOpen = false // 音频设置弹层（音乐 / 音效双滑杆）
    this.audioDrag = null // 正在拖动的滑杆 'bgm' | 'sfx'
    this.warmIdx = 0 // 立绘分帧预热进度（滚动顺滑的关键）
    this.warmLocked = false // 未解锁剪影是否已预热

    // 卡片详情弹层（大照片 + 自我介绍）
    this.detail = -1
    this.detailT = 0
  }

  _computeLayout() {
    const { w, h, safeTop, menu } = this.view
    const pad = 18
    const gap = 12
    // 标题 / 网格整体落在胶囊安全线以下
    const gridTop = safeTop + 68
    const gridBottom = h - 16
    this.viewTop = gridTop
    this.viewH = gridBottom - gridTop

    const cardW = (w - pad * 2 - gap * (COLS - 1)) / COLS
    const cardH = cardW * 1.18
    const gridW = cardW * COLS + gap * (COLS - 1)
    const startX = (w - gridW) / 2

    // 左上角：去探索 / 成就 / 音乐 三个入口（与系统胶囊同行但分居两侧，绝不重叠）
    const headH = Math.max(28, menu.height)
    this.exploreBtn = { x: 12, y: menu.top, w: 64, h: headH }
    this.achieveBtn = { x: 12 + 64 + 8, y: menu.top, w: 64, h: headH }
    this.musicBtn = { x: 12 + 64 + 8 + 64 + 8, y: menu.top, w: 56, h: headH }
    // 商店入口：音乐按钮右侧（不越过胶囊左缘）
    const shopX = 12 + 64 + 8 + 64 + 8 + 56 + 8
    this.shopBtn = { x: shopX, y: menu.top, w: 60, h: headH }

    // 图鉴卡片 = 54 只常规猫 + 已拥有的特殊猫（每次进图鉴动态计算，保证买了就显示）
    const allEntries = ROSTER.concat(SPECIAL_CATS.filter((s) => ownsSpecialCat(s.id)))
    const rows = Math.ceil(allEntries.length / COLS)
    this.cards = allEntries.map((entry, i) => {
      const r = (i / COLS) | 0
      const c = i % COLS
      return {
        entry,
        x: startX + c * (cardW + gap),
        y: gridTop + r * (cardH + gap),
        w: cardW,
        h: cardH
      }
    })
    const contentH = rows * cardH + (rows - 1) * gap
    this.maxScroll = Math.max(0, contentH - this.viewH)
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll)
    // 整数尺寸：预热与渲染必须用同一个值，缓存键才一致（否则预热全部 miss）
    this.catSize = Math.round(cardW * 0.66)
    this.warmIdx = 0
    this.warmLocked = false

    // 音频设置弹层布局（音乐 / 音效两条进度条）
    const pw = Math.min(280, w - 64)
    this.audioBox = { x: (w - pw) / 2, y: safeTop + 80, w: pw, h: 172 }
    this.audioSliders = {
      bgm: { x: this.audioBox.x + 56, y: this.audioBox.y + 66, w: pw - 116, h: 8 },
      sfx: { x: this.audioBox.x + 56, y: this.audioBox.y + 116, w: pw - 116, h: 8 }
    }
  }

  _initBubbles() {
    const { w, h } = this.view
    this.bubbles = []
    for (let i = 0; i < 14; i++) {
      this.bubbles.push({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(2, 6),
        speed: rand(0.008, 0.03),
        phase: rand(0, Math.PI * 2)
      })
    }
  }

  // ----------------------------------------------------------------
  update(dt) {
    this.time += dt

    // 分帧预热猫立绘（每帧 2 只）：用与渲染完全一致的整数尺寸，
    // 滚动到新行时立绘已全部缓存，纯 drawImage，不再同步生成导致卡顿。
    // 底图未就绪时 getCatSprite 返回 null，不推进进度，下一帧重试。
    if (this.warmIdx < ROSTER.length) {
      let budget = 2
      while (budget-- > 0 && this.warmIdx < ROSTER.length) {
        const sp = getCatSprite(ROSTER[this.warmIdx], this.catSize, this.view.dpr)
        if (!sp) break // 底图还没加载好，等下一帧
        this.warmIdx += 1
      }
    } else if (!this.warmLocked) {
      this.warmLocked = !!getLockedSprite(this.catSize, this.view.dpr)
    }

    // 松手后的滚动惯性
    if (!this.drag && Math.abs(this.vel) > 0.004) {
      this.scrollY = clamp(this.scrollY - this.vel * dt, 0, this.maxScroll)
      this.vel *= Math.exp(-dt / 170)
      if (this.scrollY <= 0 || this.scrollY >= this.maxScroll) this.vel = 0
    }

    if (this.detail >= 0) this.detailT += dt

    for (const b of this.bubbles) {
      b.y -= b.speed * dt
      if (b.y < -10) {
        b.y = this.view.h + 10
        b.x = rand(0, this.view.w)
      }
    }

    if (this.press.i >= 0) {
      this.press.t += dt
      if (this.press.t > 260) this.press.i = -1
    }
    this.toast.t += dt
  }

  // ----------------------------------------------------------------
  onTouchStart(x, y, id) {
    // 详情层打开时：点“设为主控”按钮就设置，否则关闭
    if (this.detail >= 0) {
      const r = this.detailBtnRect
      const card = this.cards[this.detail]
      if (r && card && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        setActiveCatId(card.entry.id)
        this.toast = { text: `已设为主控：${card.entry.name}`, t: 0 }
        if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
        return
      }
      this.detail = -1
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
      return
    }

    const b = this.exploreBtn
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      this.director.runScene(new ExploreScene(this.view))
      return
    }
    const a = this.achieveBtn
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
      this.director.runScene(new AchievementScene(this.view))
      return
    }
    const m = this.musicBtn
    if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) {
      this.audioOpen = !this.audioOpen // 打开 / 关闭音频设置
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
      return
    }
    const sh = this.shopBtn
    if (x >= sh.x && x <= sh.x + sh.w && y >= sh.y && y <= sh.y + sh.h) {
      this.director.runScene(new ShopScene(this.view, 'codex'))
      return
    }

    // 音频设置弹层打开时：优先处理滑杆，点面板吸收，点空白关闭
    if (this.audioOpen) {
      const hit = this._sliderAt(x, y)
      if (hit) {
        this.audioDrag = hit
        this._applySlider(hit, x)
        return
      }
      const p = this.audioBox
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return
      this.audioOpen = false
      return
    }

    // 开始一次潜在拖拽（抬手时位移不足 8px 才算点按，避免误触）
    this.drag = {
      id,
      startY: y,
      lastY: y,
      lastT: this.time,
      scrollStart: this.scrollY,
      moved: false
    }
    this.vel = 0
  }

  onTouchMove(x, y, id) {
    // 拖音频滑杆优先
    if (this.audioDrag) {
      this._applySlider(this.audioDrag, x)
      return
    }
    // 兜底：场景切换等情况下可能只收到 move 没收到 start，
    // 用当前点惰性起拖，保证滑动永远跟手
    if (!this.drag) {
      this.drag = {
        id,
        startY: y,
        lastY: y,
        lastT: this.time,
        scrollStart: this.scrollY,
        moved: false
      }
      this.vel = 0
    }
    const d = this.drag
    // identifier 在部分宿主（PC 模拟器鼠标模拟）可能缺失或 start/move 不一致，
    // 双方有一个为空时按同一根手指处理，避免滑动被整段忽略
    if (id != null && d.id != null && d.id !== id) return
    if (Math.abs(y - d.startY) > 8) d.moved = true
    const dtMs = Math.max(1, this.time - d.lastT)
    this.vel = clamp((y - d.lastY) / dtMs, -1.4, 1.4)
    d.lastY = y
    d.lastT = this.time
    this.scrollY = clamp(d.scrollStart - (y - d.startY), 0, this.maxScroll)
  }

  onTouchEnd(x, y, id) {
    // 拖完音效滑杆：放一声咀嚼声试听
    if (this.audioDrag) {
      if (this.audioDrag === 'sfx') sfx.eat()
      this.audioDrag = null
      return
    }
    const d = this.drag
    if (!d || (id != null && d.id != null && d.id !== id)) return
    this.drag = null
    if (!d.moved) this._tapCard(x, y)
  }

  _tapCard(x, y) {
    if (y < this.viewTop || y > this.viewTop + this.viewH) return
    const contentY = y + this.scrollY
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      if (x >= c.x && x <= c.x + c.w && contentY >= c.y && contentY <= c.y + c.h) {
        this.press = { i, t: 0 }
        if (typeof wx.vibrateShort === 'function') {
          wx.vibrateShort({ type: 'light' })
        }
        // 打开大照片 + 自我介绍（未解锁显示剪影，不剧透介绍）
        this.detail = i
        this.detailT = 0
        return
      }
    }
  }

  // ----------------------------------------------------------------
  render(ctx) {
    this._drawBackground(ctx)
    this._drawBubbles(ctx)
    this._drawHeader(ctx)
    this._drawCards(ctx)
    this._drawToast(ctx)
    if (this.detail >= 0) this._drawDetail(ctx)
    if (this.audioOpen) this._drawAudioPanel(ctx)

    // 版本角标：屏幕右下角。看不到 V26 = 模拟器在跑旧缓存代码
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,248,231,0.85)'
    ctx.fillText('V26', this.view.w - 8, this.view.h - 6)
  }

  _drawBackground(ctx) {
    const { w, h } = this.view
    if (!this._bgGrad) {
      this._bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      this._bgGrad.addColorStop(0, THEME.seaTop)
      this._bgGrad.addColorStop(0.55, THEME.seaMid)
      this._bgGrad.addColorStop(1, THEME.seaBottom)

      this._glow = ctx.createRadialGradient(w / 2, h * 0.16, 10, w / 2, h * 0.16, h * 0.6)
      this._glow.addColorStop(0, 'rgba(255,255,255,0.45)')
      this._glow.addColorStop(1, 'rgba(255,255,255,0)')
    }
    ctx.fillStyle = this._bgGrad
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = this._glow
    ctx.fillRect(0, 0, w, h)
  }

  _drawBubbles(ctx) {
    for (const b of this.bubbles) {
      const sx = b.x + Math.sin(this.time * 0.0012 + b.phase) * 4
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath()
      ctx.arc(sx, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.beginPath()
      ctx.arc(sx - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _drawHeader(ctx) {
    const { w, safeTop } = this.view

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 30px sans-serif'
    ctx.fillText('鱼鱼蛋蛋喵', w / 2, safeTop + 28)

    ctx.fillStyle = THEME.inkSoft
    ctx.font = '11px sans-serif'
    ctx.fillText(
      `— 鱼鱼蛋蛋喵图鉴 · ${unlockedCount()} / ${ROSTER.length} —`,
      w / 2,
      safeTop + 50
    )

    // 去探索按钮（主橙填充 + 砖红描边 + 奶油白字）
    const b = this.exploreBtn
    roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2)
    ctx.fillStyle = THEME.orange
    ctx.fill()
    ctx.strokeStyle = 'rgba(212,108,78,0.55)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('去探索', b.x + b.w / 2, b.y + b.h / 2 + 4.5)

    // 成就入口（深海青填充，与主橙按钮区分）
    const a = this.achieveBtn
    roundRectPath(ctx, a.x, a.y, a.w, a.h, a.h / 2)
    ctx.fillStyle = THEME.teal
    ctx.fill()
    ctx.strokeStyle = 'rgba(38,77,89,0.25)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.cream
    ctx.fillText('成就', a.x + a.w / 2, a.y + a.h / 2 + 4.5)

    // 音频设置入口：奶油底 + 深海青描边（点开双滑杆弹层）
    const m = this.musicBtn
    roundRectPath(ctx, m.x, m.y, m.w, m.h, m.h / 2)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = 'rgba(67,151,141,0.6)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.teal
    ctx.fillText('♪ 音频', m.x + m.w / 2, m.y + m.h / 2 + 4.5)

    // 商店入口：奶油底 + 鎏金描边
    const sh = this.shopBtn
    roundRectPath(ctx, sh.x, sh.y, sh.w, sh.h, sh.h / 2)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,171,63,0.8)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = '#b8860b'
    ctx.fillText('商店', sh.x + sh.w / 2, sh.y + sh.h / 2 + 4.5)
  }

  _drawCards(ctx) {
    const { w } = this.view
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, this.viewTop, w, this.viewH)
    ctx.clip()
    ctx.translate(0, -this.scrollY)

    this.cards.forEach((c, i) => {
      // 视锥剔除：只画当前滚动视口内的卡片
      if (c.y + c.h < this.viewTop + this.scrollY - 12) return
      if (c.y > this.viewTop + this.scrollY + this.viewH + 12) return

      const unlocked = isUnlocked(c.entry.id)

      let scale = 1
      if (this.press.i === i) {
        const t = this.press.t
        scale = t < 120 ? lerp(1, 0.92, t / 120) : lerp(0.92, 1, (t - 120) / 140)
      }

      ctx.save()
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2)
      ctx.scale(scale, scale)
      ctx.translate(-c.w / 2, -c.h / 2)

      // 柔和投影（两层偏移圆角矩形，避免 shadowBlur 的开销）
      roundRectPath(ctx, 0, 2.5, c.w, c.h, 14)
      ctx.fillStyle = THEME.shadowSoft
      ctx.fill()
      roundRectPath(ctx, 0, 5, c.w, c.h, 14)
      ctx.fillStyle = THEME.shadow
      ctx.fill()

      // 卡面：奶油白；未解锁用略带灰的奶油色
      roundRectPath(ctx, 0, 0, c.w, c.h, 14)
      ctx.fillStyle = unlocked ? THEME.cream : THEME.creamDim
      ctx.fill()
      ctx.strokeStyle = unlocked ? THEME.seaLine : THEME.lockStroke
      ctx.lineWidth = 1.2
      ctx.stroke()

      const size = this.catSize
      const ix = (c.w - size) / 2
      const iy = c.h * 0.08
      const img = unlocked
        ? getCatSprite(c.entry, size, this.view.dpr)
        : getLockedSprite(size, this.view.dpr)
      if (img) {
        ctx.drawImage(img, ix, iy, size, size)
      } else {
        // 灰度图尚未加载完：柔和占位，下一帧自动替换
        ctx.save()
        ctx.translate(ix + size / 2, iy + size / 2)
        drawCatPlaceholder(ctx, size)
        ctx.restore()
      }

      ctx.textAlign = 'center'
      ctx.font = `${Math.round(c.w * 0.135)}px sans-serif`
      ctx.fillStyle = unlocked ? THEME.ink : THEME.inkFaint
      ctx.fillText(unlocked ? c.entry.name : '？？？', c.w / 2, c.h - 11)

      // 稀有猫右上角小圆点（未解锁不剧透）
      if (unlocked && c.entry.rare) {
        ctx.beginPath()
        ctx.arc(c.w - 9, 9, 3.2, 0, Math.PI * 2)
        ctx.fillStyle = THEME.butter
        ctx.fill()
        ctx.strokeStyle = THEME.seaLine
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.restore()
    })

    ctx.restore()
  }

  /** 命中测试：返回被点中的滑杆 id（热区比轨道大一圈） */
  _sliderAt(x, y) {
    for (const key of ['bgm', 'sfx']) {
      const s = this.audioSliders[key]
      if (x >= s.x - 14 && x <= s.x + s.w + 14 && y >= s.y - 16 && y <= s.y + s.h + 16) {
        return key
      }
    }
    return null
  }

  /** 按触点 x 应用滑杆音量 */
  _applySlider(key, x) {
    const s = this.audioSliders[key]
    const v = clamp((x - s.x) / s.w, 0, 1)
    if (key === 'bgm') setBgmVol(v)
    else setSfxVol(v)
  }

  /** 音频设置弹层：音乐 / 音效双滑杆（点空白处关闭） */
  _drawAudioPanel(ctx) {
    const { w, h } = this.view
    ctx.save()

    // 全屏压暗
    ctx.fillStyle = 'rgba(38,77,89,0.4)'
    ctx.fillRect(0, 0, w, h)

    // 面板
    const p = this.audioBox
    roundRectPath(ctx, p.x, p.y + 3, p.w, p.h, 16)
    ctx.fillStyle = THEME.shadowSoft
    ctx.fill()
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 16)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = THEME.butter
    ctx.lineWidth = 1.6
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('音频设置', p.x + p.w / 2, p.y + 32)

    for (const key of ['bgm', 'sfx']) {
      const s = this.audioSliders[key]
      const v = key === 'bgm' ? getBgmVol() : getSfxVol()

      // 标签
      ctx.textAlign = 'left'
      ctx.fillStyle = THEME.inkSoft
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(key === 'bgm' ? '音乐' : '音效', p.x + 20, s.y + 4.5)

      // 轨道 + 填充
      roundRectPath(ctx, s.x, s.y, s.w, s.h, s.h / 2)
      ctx.fillStyle = 'rgba(38,77,89,0.12)'
      ctx.fill()
      if (v > 0) {
        roundRectPath(ctx, s.x, s.y, Math.max(s.h, s.w * v), s.h, s.h / 2)
        ctx.fillStyle = key === 'bgm' ? THEME.teal : THEME.butter
        ctx.fill()
      }

      // 圆钮
      ctx.beginPath()
      ctx.arc(s.x + s.w * v, s.y + s.h / 2, 10, 0, Math.PI * 2)
      ctx.fillStyle = THEME.cream
      ctx.fill()
      ctx.strokeStyle = key === 'bgm' ? THEME.teal : 'rgba(212,108,78,0.8)'
      ctx.lineWidth = 2
      ctx.stroke()

      // 百分比
      ctx.textAlign = 'center'
      ctx.fillStyle = THEME.ink
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`${Math.round(v * 100)}%`, s.x + s.w + 28, s.y + 4.5)
    }

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.inkFaint
    ctx.font = '11px sans-serif'
    ctx.fillText('拖动圆点调节 · 音效松手试听 · 点空白处关闭', p.x + p.w / 2, p.y + p.h - 20)
    ctx.restore()
  }

  // ---- 卡片详情：大照片 + 性格自我介绍 ----
  _wrapText(ctx, text, maxW) {
    const lines = []
    let line = ''
    for (const ch of text) {
      if (line && ctx.measureText(line + ch).width > maxW) {
        // 标点避头尾：句读标点挂在上一行末尾，不独占下一行行首
        if ('。，！？、；：…—'.includes(ch)) {
          lines.push(line + ch)
          line = ''
        } else {
          lines.push(line)
          line = ch
        }
      } else {
        line += ch
      }
    }
    if (line) lines.push(line)
    return lines // 话唠型最长约 100 字，卡片高度按行数动态撑开
  }

  _drawChip(ctx, text, cx, y, fill, textColor, stroke) {
    ctx.font = 'bold 11px sans-serif'
    const cw = ctx.measureText(text).width + 18
    const ch = 20
    roundRectPath(ctx, cx - cw / 2, y, cw, ch, ch / 2)
    ctx.fillStyle = fill
    ctx.fill()
    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.fillText(text, cx, y + 14)
    return cw
  }

  _drawDetail(ctx) {
    const { w, h, dpr } = this.view
    const card = this.cards[this.detail]
    if (!card) return
    const entry = card.entry
    const unlocked = isUnlocked(entry.id)

    const t = clamp(this.detailT / 240, 0, 1)
    const ease = 1 - Math.pow(1 - t, 3)
    const scale = 0.86 + 0.14 * ease

    // 遮罩
    ctx.fillStyle = `rgba(38,77,89,${0.45 * t})`
    ctx.fillRect(0, 0, w, h)

    const pw = Math.min(w - 56, 300)
    // 卡片高度随自我介绍行数动态撑开：话少 2 行、话唠最多约 8 行
    ctx.font = '14px sans-serif'
    const introLines = unlocked ? this._wrapText(ctx, entry.intro, pw - 56) : []
    let bodyLH = 21
    let ph = unlocked ? 312 + introLines.length * bodyLH : 360
    if (ph > h - 24) {
      bodyLH = 18 // 极矮屏：压紧行距保证不溢出
      ph = 312 + introLines.length * bodyLH
    }
    ph = clamp(ph, 360, h - 24)
    const px = (w - pw) / 2
    const py = (h - ph) / 2

    ctx.save()
    ctx.translate(px + pw / 2, py + ph / 2)
    ctx.scale(scale, scale)
    ctx.translate(-pw / 2, -ph / 2)

    // 卡片投影 + 主体
    roundRectPath(ctx, 0, 4, pw, ph, 22)
    ctx.fillStyle = THEME.shadow
    ctx.fill()
    roundRectPath(ctx, 0, 0, pw, ph, 22)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = THEME.seaLine
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.textAlign = 'center'

    // 顶部小标题 + 关闭叉
    ctx.fillStyle = THEME.inkSoft
    ctx.font = '11px sans-serif'
    ctx.fillText('猫 咪 档 案', pw / 2, 26)
    ctx.strokeStyle = THEME.inkSoft
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(16, 14)
    ctx.lineTo(28, 26)
    ctx.moveTo(28, 14)
    ctx.lineTo(16, 26)
    ctx.stroke()

    // 编号（右上）
    ctx.fillStyle = THEME.inkFaint
    ctx.font = '11px sans-serif'
    ctx.fillText(`No.${String(this.detail + 1).padStart(2, '0')}`, pw - 28, 24)

    // 大照片区：奶油圆底；稀有猫加奶油黄光晕
    const imgCx = pw / 2
    const imgCy = 98
    const imgSize = 138
    if (unlocked && entry.rare) {
      const g = ctx.createRadialGradient(imgCx, imgCy, 8, imgCx, imgCy, 84)
      g.addColorStop(0, 'rgba(249,224,127,0.5)')
      g.addColorStop(1, 'rgba(249,224,127,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(imgCx, imgCy, 84, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(imgCx, imgCy, 72, 0, Math.PI * 2)
    ctx.fillStyle = THEME.creamDim
    ctx.fill()
    const img = unlocked
      ? getCatSprite(entry, imgSize, dpr)
      : getLockedSprite(imgSize, dpr)
    if (img) ctx.drawImage(img, imgCx - imgSize / 2, imgCy - imgSize / 2 - 2, imgSize, imgSize)

    // 名字
    ctx.fillStyle = unlocked ? THEME.ink : THEME.inkFaint
    ctx.font = 'bold 21px sans-serif'
    ctx.fillText(unlocked ? entry.name : '？？？', pw / 2, 196)

    // 标签行：性格风格 + 稀有度
    const chips = []
    if (unlocked) {
      chips.push({ text: entry.introStyle, kind: 'style' })
      if (entry.colorRarity === 'rare') chips.push({ text: '稀有颜色', kind: 'rare' })
      if (entry.patternTier === 'rare') chips.push({ text: '稀有花纹', kind: 'rare' })
      if (!entry.rare) chips.push({ text: '普通', kind: 'plain' })
    } else {
      chips.push({ text: '尚未遇见', kind: 'plain' })
    }
    // 性格标签配色（10 种性格 × 三档话量；只用色卡 token）
    const STYLE_FILL = {
      '冷漠': [THEME.inkSoft, THEME.cream, null],
      '社恐': [THEME.creamDim, THEME.teal, THEME.seaLine],
      '高冷': [THEME.navy, THEME.cream, null],
      '摆烂': [THEME.grassA, THEME.navy, null],
      '嘴碎': [THEME.orange, THEME.cream, null],
      '装': [THEME.navy, THEME.butter, null],
      '搞怪': [THEME.butter, THEME.ink, null],
      '话唠': [THEME.brick, THEME.cream, null],
      '自来熟': [THEME.teal, THEME.cream, null],
      '操心': [THEME.cream, THEME.brick, THEME.brick]
    }
    ctx.font = 'bold 11px sans-serif'
    const gap = 8
    const widths = chips.map((c) => {
      if (c.kind === 'style') return ctx.measureText(c.text).width + 18
      if (c.kind === 'rare') return ctx.measureText(c.text).width + 18
      return ctx.measureText(c.text).width + 18
    })
    let chipsTotal = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)
    let chipX = (pw - chipsTotal) / 2
    const chipY = 212
    chips.forEach((c, i) => {
      const cw = widths[i]
      const cx = chipX + cw / 2
      if (c.kind === 'style') {
        const [fill, tc, st] = STYLE_FILL[c.text]
        this._drawChip(ctx, c.text, cx, chipY, fill, tc, st)
      } else if (c.kind === 'rare') {
        this._drawChip(ctx, c.text, cx, chipY, THEME.butter, THEME.brick, null)
      } else {
        this._drawChip(ctx, c.text, cx, chipY, THEME.creamDim, THEME.inkSoft, THEME.lockStroke)
      }
      chipX += cw + gap
    })

    // 自我介绍 / 未解锁提示（行数已在弹层布局阶段算好，动态行距）
    if (unlocked) {
      // 简介从“设为主控”按钮上方往上排：行数越多整体越高，绝不压按钮、不碰标签
      const lastBase = ph - 64 - 18
      const introTop = lastBase - (introLines.length - 1) * bodyLH
      ctx.fillStyle = THEME.inkSoft
      ctx.font = '10px sans-serif'
      ctx.fillText('— 自我介绍 —', pw / 2, introTop - 24)
      ctx.fillStyle = THEME.ink
      ctx.font = '14px sans-serif'
      introLines.forEach((ln, i) => {
        ctx.fillText(ln, pw / 2, introTop + i * bodyLH)
      })
    } else {
      ctx.fillStyle = THEME.inkSoft
      ctx.font = '14px sans-serif'
      ctx.fillText('还没遇见这只猫', pw / 2, 278)
      ctx.font = '12px sans-serif'
      ctx.fillText('去探索吃鱼、孵蛋解锁吧', pw / 2, 302)
    }

    // 已解锁时底部显示“设为主控”按钮
    if (unlocked) {
      const bw = 140
      const bh = 36
      const bx = (pw - bw) / 2
      const by = ph - 64
      // 记录实际屏幕坐标供触摸判断（卡片有缩放动画，这里用未缩放的目标位置）
      this.detailBtnRect = { x: px + bx, y: py + by, w: bw, h: bh }
      const isActive = getActiveCatId() === entry.id
      roundRectPath(ctx, bx, by, bw, bh, bh / 2)
      ctx.fillStyle = isActive ? 'rgba(67,151,141,0.18)' : THEME.teal
      ctx.fill()
      ctx.strokeStyle = isActive ? 'rgba(67,151,141,0.5)' : 'rgba(38,77,89,0.25)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.fillStyle = isActive ? THEME.teal : THEME.cream
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(isActive ? '当前主控' : '设为主控', pw / 2, by + 23)

      // 底部提示（按钮上方一点）
      ctx.fillStyle = THEME.inkFaint
      ctx.font = '11px sans-serif'
      ctx.fillText('轻点卡片外任意处关闭', pw / 2, ph - 14)
    } else {
      this.detailBtnRect = null
      ctx.fillStyle = THEME.inkFaint
      ctx.font = '11px sans-serif'
      ctx.fillText('轻点任意处关闭', pw / 2, ph - 20)
    }

    ctx.restore()
  }

  _drawToast(ctx) {
    const t = this.toast.t
    if (t > 1600 || !this.toast.text) return

    const alpha = t < 150 ? t / 150 : t > 1300 ? clamp(1 - (t - 1300) / 300, 0, 1) : 1
    const { w, h } = this.view

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = '14px sans-serif'
    const tw = ctx.measureText(this.toast.text).width
    const pw = tw + 36
    const ph = 38
    const px = (w - pw) / 2
    const py = h * 0.8 - ph / 2

    roundRectPath(ctx, px, py, pw, ph, 19)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = THEME.seaLine
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.fillText(this.toast.text, w / 2, py + ph / 2 + 5)
    ctx.restore()
  }
}
