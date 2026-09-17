import Seabed from '../entities/seabed'
import ExploreScene from './explore'
import { ROSTER, hasProgress, resetSave } from '../data/cats'
import { preloadCatArt, getCatSprite, drawCatPlaceholder } from '../render/catArt'
import { sfx } from '../core/audio'
import { THEME } from '../core/theme'
import { clamp, rand, roundRectPath } from '../core/util'

/**
 * 封面页：只复用探索区的海底背景绘制（海水 / 光束 / 水团 / 视差珊瑚 / 气泡 / 微粒），
 * 不带任何游戏逻辑（无摇杆 / 鱼 / 经验条）。
 *   - 上方：游戏名 + 继续游戏/开始游戏按钮（有存档进度时附"重新开始"）
 *   - 下半屏：一群颜色花纹各异的猫堆叠晃动；划过即喵一声 + 弹一下
 */
export default class CoverScene {
  constructor(view) {
    this.view = view
    this.time = 0

    preloadCatArt()
    this.seabed = new Seabed(view) // 纯装饰：只调 renderParallax
    this._initDecor()

    // 主按钮：有进度 = 继续游戏，无进度 = 开始游戏（居中，标题下方）
    // 注意：必须先定义按钮，_initCats 依赖 startBtn/restartBtn 计算猫堆上限
    this.hasSave = hasProgress()
    const bw = 190
    const bh = 54
    this.startBtn = { x: (view.w - bw) / 2, y: view.safeTop + 148, w: bw, h: bh }
    // 重新开始按钮（仅在有进度时显示，主按钮下方窄胶囊）
    const rw = 130
    const rh = 34
    this.restartBtn = this.hasSave
      ? { x: (view.w - rw) / 2, y: this.startBtn.y + bh + 12, w: rw, h: rh }
      : null
    // 重开确认弹层（防误触清档）
    this.confirmOpen = false
    this.confirmRects = null

    this._initCats()

    // 喵声节流：同一时间只播一声，不打断
    this.meowLockUntil = 0
    this.lastCat = null
    this.pressing = false
  }

  _initDecor() {
    const { w, h } = this.view
    this.bubbles = []
    for (let i = 0; i < 14; i++) {
      this.bubbles.push({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(2, 6),
        speed: rand(0.008, 0.028),
        phase: rand(0, Math.PI * 2)
      })
    }
    this.motes = []
    for (let i = 0; i < 22; i++) {
      this.motes.push({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(0.8, 2),
        speed: rand(0.006, 0.016),
        phase: rand(0, Math.PI * 2),
        a: rand(0.1, 0.28)
      })
    }
  }

  _initCats() {
    const { w, h, safeTop } = this.view
    const btnBottom = this.restartBtn
      ? this.restartBtn.y + this.restartBtn.h
      : this.startBtn.y + this.startBtn.h
    const topLimit = btnBottom + 14 // 猫头不越过按钮下缘
    const n = 11
    const list = []
    for (let i = 0; i < n; i++) {
      const depth = rand(0, 1) // 0 = 最后排（小） ~ 1 = 最前排（大）
      const size = 84 + depth * 54 + rand(-6, 6)
      // (i*7)%54 遍历全花名册，颜色花纹天然错开
      const entry = ROSTER[(i * 7) % ROSTER.length]
      list.push({
        entry,
        size,
        depth,
        x: clamp(w * 0.5 + rand(-0.46, 0.46) * w, size * 0.3, w - size * 0.3),
        y: h * (0.66 + depth * 0.22) + rand(-10, 10),
        amp: rand(2.5, 6.5), // 左右晃动幅度
        sw: rand(0.0009, 0.0016), // 晃动角速度
        phase: rand(0, Math.PI * 2),
        rotAmp: rand(0.02, 0.05),
        bounceT: 9999
      })
    }
    // 位置钳制：只在下半屏、不压标题按钮、可探出屏底（半只身子）
    for (const c of list) {
      c.y = clamp(c.y, topLimit + c.size * 0.85, h + c.size * 0.25)
    }
    // 按深度从小到大排序：先画后排小猫，前排大猫自然叠在上面
    list.sort((a, b) => a.depth - b.depth)
    this.cats = list
  }

  update(dt) {
    this.time += dt
    for (const b of this.bubbles) {
      b.y -= b.speed * dt
      if (b.y < -10) {
        b.y = this.view.h + 10
        b.x = rand(0, this.view.w)
      }
    }
    for (const m of this.motes) {
      m.y -= m.speed * dt
      m.x += Math.sin(this.time * 0.0008 + m.phase) * 0.008 * dt
      if (m.y < -6) {
        m.y = this.view.h + 6
        m.x = rand(0, this.view.w)
      }
      if (m.x < -6) m.x = this.view.w + 6
      else if (m.x > this.view.w + 6) m.x = -6
    }
    for (const c of this.cats) c.bounceT += dt
  }

  // ----------------------------------------------------------------
  onTouchStart(x, y, id) {
    this.pressing = true
    // 重开确认弹层打开时：吸收全部触摸（只响应弹层内按钮）
    if (this.confirmOpen) {
      this._touchConfirm(x, y)
      return
    }
    const b = this.startBtn
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
      this.director.runScene(new ExploreScene(this.view))
      return
    }
    const r = this.restartBtn
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
      this.confirmOpen = true
      return
    }
    this._touchCats(x, y)
  }

  onTouchMove(x, y, id) {
    if (!this.pressing || this.confirmOpen) return
    this._touchCats(x, y)
  }

  onTouchEnd() {
    this.pressing = false
    this.lastCat = null // 抬手后重新触摸可再次触发
  }

  /** 重开确认弹层的按钮：确定重开（清档）/ 再想想 */
  _touchConfirm(x, y) {
    const rects = this.confirmRects
    if (!rects) return
    const hit = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
    if (hit(rects.ok)) {
      resetSave()
      this.hasSave = false
      this.restartBtn = null
      this.confirmOpen = false
      this.confirmRects = null
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
    } else if (hit(rects.no)) {
      this.confirmOpen = false
      this.confirmRects = null
    }
  }

  /** 划过哪只猫：弹一下 + 喵一声（节流，同一时间只有一声） */
  _touchCats(x, y) {
    // 从最前排往前找
    for (let i = this.cats.length - 1; i >= 0; i--) {
      const c = this.cats[i]
      if (
        Math.abs(x - c.x) <= c.size * 0.52 &&
        y >= c.y - c.size &&
        y <= c.y + c.size * 0.25
      ) {
        if (this.lastCat !== c) {
          this.lastCat = c
          c.bounceT = 0
          if (this.time >= this.meowLockUntil) {
            sfx.born() // 低音奶声喵
            this.meowLockUntil = this.time + 520
          }
        }
        return
      }
    }
    this.lastCat = null
  }

  // ----------------------------------------------------------------
  render(ctx) {
    const { w, h } = this.view
    this._drawBackground(ctx)
    this._drawBeams(ctx)
    this.seabed.renderParallax(ctx, 0, 0, this.time)
    this._drawMotes(ctx)
    this._drawBubbles(ctx)
    this._drawCats(ctx)
    this._drawTitle(ctx)
    this._drawStartBtn(ctx)
    if (this.confirmOpen) this._drawConfirm(ctx)

    // 版本角标：屏幕右下角
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,248,231,0.85)'
    ctx.fillText('V23', w - 8, h - 6)
  }

  /** 海水：深浅蓝色层次 + 顶部光晕 + 漂移水团（与探索区同款观感） */
  _drawBackground(ctx) {
    const { w, h } = this.view
    if (!this._bgGrad) {
      this._bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      this._bgGrad.addColorStop(0, '#DCEDEB')
      this._bgGrad.addColorStop(0.32, '#ABCFD1')
      this._bgGrad.addColorStop(0.64, '#7FB1C3')
      this._bgGrad.addColorStop(1, '#5E92AC')

      this._glow = ctx.createRadialGradient(w / 2, h * 0.14, 10, w / 2, h * 0.14, h * 0.6)
      this._glow.addColorStop(0, 'rgba(255,255,255,0.4)')
      this._glow.addColorStop(1, 'rgba(255,255,255,0)')

      this._patches = [
        { x: 0.24, y: 0.3, r: 0.55, c: 'rgba(255,255,255,0.09)', wx: 0.00022, wy: 0.00016 },
        { x: 0.78, y: 0.62, r: 0.6, c: 'rgba(94,146,172,0.16)', wx: -0.00018, wy: 0.00013 },
        { x: 0.5, y: 0.96, r: 0.66, c: 'rgba(38,77,89,0.14)', wx: 0.00015, wy: -0.00011 }
      ]
    }
    ctx.fillStyle = this._bgGrad
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = this._glow
    ctx.fillRect(0, 0, w, h)
    for (const p of this._patches) {
      const px = (p.x + Math.sin(this.time * p.wx) * 0.07) * w
      const py = (p.y + Math.cos(this.time * p.wy) * 0.05) * h
      const g = ctx.createRadialGradient(px, py, 8, px, py, p.r * w)
      g.addColorStop(0, p.c)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  }

  /** 洒下来的光柱 */
  _drawBeams(ctx) {
    const { w, h } = this.view
    ctx.save()
    ctx.globalAlpha = 0.1
    ctx.fillStyle = '#FFFFFF'
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.22 + i * 0.28) + Math.sin(this.time * 0.0002 + i * 2.1) * 20
      const topW = 26 + i * 8
      const botW = topW * 3.2
      ctx.beginPath()
      ctx.moveTo(cx - topW / 2, -20)
      ctx.lineTo(cx + topW / 2, -20)
      ctx.lineTo(cx + botW / 2, h)
      ctx.lineTo(cx - botW / 2, h)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  _drawMotes(ctx) {
    for (const m of this.motes) {
      const sx = m.x + Math.sin(this.time * 0.0008 + m.phase) * 3
      ctx.fillStyle = `rgba(255,248,231,${m.a})`
      ctx.beginPath()
      ctx.arc(sx, m.y, m.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _drawBubbles(ctx) {
    for (const b of this.bubbles) {
      const sx = b.x + Math.sin(this.time * 0.001 + b.phase) * 4
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(sx, b.y, b.r, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  /** 底部的猫堆：晃动 + 被摸时弹一下 */
  _drawCats(ctx) {
    for (const c of this.cats) {
      const sway = Math.sin(this.time * c.sw + c.phase)
      // 被划过：320ms 的果冻弹跳（横向压扁 / 纵向拉伸交替）
      const bt = c.bounceT
      const pop = bt < 320 ? Math.sin((bt / 320) * Math.PI) : 0
      const sx2 = 1 - 0.09 * pop
      const sy2 = 1 + 0.13 * pop

      ctx.save()
      ctx.translate(c.x + sway * c.amp, c.y)
      ctx.rotate(sway * c.rotAmp)
      ctx.scale(sx2, sy2)
      const img = getCatSprite(c.entry, Math.round(c.size), this.view.dpr)
      if (img) {
        ctx.drawImage(img, -c.size / 2, -c.size, c.size, c.size)
      } else {
        // 立绘未加载完：柔和占位猫
        ctx.translate(0, -c.size / 2)
        drawCatPlaceholder(ctx, c.size)
      }
      ctx.restore()
    }
  }

  /** 游戏名（奶油黄 + 主橙描边 + 柔和投影） */
  _drawTitle(ctx) {
    const { w, safeTop } = this.view
    const ty = safeTop + 84
    ctx.textAlign = 'center'

    // 投影层
    ctx.font = 'bold 42px sans-serif'
    ctx.fillStyle = 'rgba(38,77,89,0.28)'
    ctx.fillText('鱼鱼蛋蛋喵', w / 2 + 2, ty + 3)

    // 主层：奶油黄填充 + 主橙描边
    ctx.strokeStyle = THEME.orange
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeText('鱼鱼蛋蛋喵', w / 2, ty)
    ctx.fillStyle = THEME.butter
    ctx.fillText('鱼鱼蛋蛋喵', w / 2, ty)

    ctx.fillStyle = 'rgba(255,248,231,0.8)'
    ctx.font = '12px sans-serif'
    ctx.fillText('— 滑动摸摸它们，会有喵声 —', w / 2, ty + 30)
  }

  _drawStartBtn(ctx) {
    const b = this.startBtn
    // 双层投影
    roundRectPath(ctx, b.x, b.y + 3, b.w, b.h, b.h / 2)
    ctx.fillStyle = 'rgba(38,77,89,0.22)'
    ctx.fill()
    roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2)
    ctx.fillStyle = THEME.orange
    ctx.fill()
    ctx.strokeStyle = 'rgba(212,108,78,0.55)'
    ctx.lineWidth = 1.4
    ctx.stroke()

    // 呼吸微光提示可点
    const pulse = 1 + 0.02 * Math.sin(this.time * 0.004)
    ctx.save()
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2)
    ctx.scale(pulse, pulse)
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 19px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(this.hasSave ? '继续游戏' : '开始游戏', 0, 6.5)
    ctx.restore()

    // 重新开始入口（仅在有进度时显示）
    const r = this.restartBtn
    if (r) {
      roundRectPath(ctx, r.x, r.y, r.w, r.h, r.h / 2)
      ctx.fillStyle = 'rgba(255,248,231,0.92)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(212,108,78,0.55)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.fillStyle = THEME.brick
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('重新开始', r.x + r.w / 2, r.y + r.h / 2 + 4.5)
    }
  }

  /** 重开确认弹层：半透明遮罩 + 面板（确定重开 = 清档回初始，不可撤销） */
  _drawConfirm(ctx) {
    const { w, h } = this.view
    ctx.fillStyle = 'rgba(23,42,52,0.55)'
    ctx.fillRect(0, 0, w, h)

    const pw = Math.min(w - 64, 300)
    const ph = 168
    const px = (w - pw) / 2
    const py = (h - ph) / 2
    roundRectPath(ctx, px, py, pw, ph, 18)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = 'rgba(38,77,89,0.25)'
    ctx.lineWidth = 1.4
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 17px sans-serif'
    ctx.fillText('重新开始？', w / 2, py + 38)
    ctx.fillStyle = THEME.inkSoft
    ctx.font = '13px sans-serif'
    ctx.fillText('经验、图鉴、进化点数', w / 2, py + 66)
    ctx.fillText('会全部清空，从头再来喵', w / 2, py + 86)

    const bw = 110
    const bh = 38
    const by = py + ph - bh - 20
    // 确定重开（砖红实底）
    const okX = px + 18
    roundRectPath(ctx, okX, by, bw, bh, bh / 2)
    ctx.fillStyle = THEME.brick
    ctx.fill()
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('确定重开', okX + bw / 2, by + bh / 2 + 5)
    // 再想想（奶油底描边）
    const noX = px + pw - bw - 18
    roundRectPath(ctx, noX, by, bw, bh, bh / 2)
    ctx.fillStyle = 'rgba(255,248,231,0.95)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(38,77,89,0.35)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.ink
    ctx.fillText('再想想', noX + bw / 2, by + bh / 2 + 5)

    // 热区（绘制时同步，供 _touchConfirm 命中）
    this.confirmRects = {
      ok: { x: okX, y: by, w: bw, h: bh },
      no: { x: noX, y: by, w: bw, h: bh }
    }
  }
}
