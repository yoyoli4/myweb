import CodexScene from './codex'
import ExploreScene from './explore'
import { getAchievementStates, achievedCount, ACHIEVEMENTS } from '../data/achievements'
import { THEME } from '../core/theme'
import { clamp, rand, roundRectPath } from '../core/util'

const PAD = 16
const GAP = 8
const ROW_H = 68

/**
 * 成就页（从图鉴或探索区进入）：
 *   左上「返回」回来源页（backTo: 'codex' | 'explore'），顶部标题；
 *   成就行纵向滚动，未解锁灰色剪影、解锁后奶油黄点亮；
 *   隐藏成就（hidden）解锁前显示 ？？？。
 * 所有顶部元素都在 view.safeTop 以下 / 胶囊左缘以内。
 */
export default class AchievementScene {
  constructor(view, backTo = 'codex') {
    this.view = view
    this.backTo = backTo
    this.time = 0

    this.rows = getAchievementStates() // 进页面时取最新快照
    this._initBubbles()

    // 滚动状态
    this.scrollY = 0
    this.maxScroll = 0
    this.vel = 0
    this.drag = null
    this._computeLayout()
  }

  _computeLayout() {
    const { w, h, safeTop, menu } = this.view
    this.listTop = safeTop + 68
    this.listH = h - 16 - this.listTop

    this.rowW = w - PAD * 2
    this.contentH = this.rows.length * ROW_H + (this.rows.length - 1) * GAP
    this.maxScroll = Math.max(0, this.contentH - this.listH)
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll)

    // 左上返回键（与系统胶囊同行，互不重叠）
    const headH = Math.max(28, menu.height)
    this.backBtn = { x: 12, y: menu.top, w: 64, h: headH }
  }

  _initBubbles() {
    const { w, h } = this.view
    this.bubbles = []
    for (let i = 0; i < 12; i++) {
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
    if (!this.drag && Math.abs(this.vel) > 0.004) {
      this.scrollY = clamp(this.scrollY - this.vel * dt, 0, this.maxScroll)
      this.vel *= Math.exp(-dt / 170)
      if (this.scrollY <= 0 || this.scrollY >= this.maxScroll) this.vel = 0
    }
    for (const b of this.bubbles) {
      b.y -= b.speed * dt
      if (b.y < -10) {
        b.y = this.view.h + 10
        b.x = rand(0, this.view.w)
      }
    }
  }

  // ----------------------------------------------------------------
  onTouchStart(x, y, id) {
    const b = this.backBtn
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      // 从哪儿进来回哪儿去
      this.director.runScene(
        this.backTo === 'explore' ? new ExploreScene(this.view) : new CodexScene(this.view)
      )
      return
    }
    this.drag = {
      id,
      startY: y,
      lastY: y,
      lastT: this.time,
      scrollStart: this.scrollY
    }
    this.vel = 0
  }

  onTouchMove(x, y, id) {
    // 兜底：场景切换边界可能只收到 move，惰性起拖
    if (!this.drag) {
      this.drag = { id, startY: y, lastY: y, lastT: this.time, scrollStart: this.scrollY }
      this.vel = 0
    }
    const d = this.drag
    // identifier 缺失/跨宿主不一致时按同一根手指处理，避免滑动被忽略
    if (id != null && d.id != null && d.id !== id) return
    const dtMs = Math.max(1, this.time - d.lastT)
    this.vel = clamp((y - d.lastY) / dtMs, -1.4, 1.4)
    d.lastY = y
    d.lastT = this.time
    this.scrollY = clamp(d.scrollStart - (y - d.startY), 0, this.maxScroll)
  }

  onTouchEnd(x, y, id) {
    const d = this.drag
    if (!d || (id != null && d.id != null && d.id !== id)) return
    this.drag = null
  }

  // ----------------------------------------------------------------
  render(ctx) {
    this._drawBackground(ctx)
    this._drawBubbles(ctx)
    this._drawHeader(ctx)
    this._drawList(ctx)
  }

  _drawBackground(ctx) {
    const { w, h } = this.view
    if (!this._bgGrad) {
      this._bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      this._bgGrad.addColorStop(0, THEME.seaTop)
      this._bgGrad.addColorStop(0.55, THEME.seaMid)
      this._bgGrad.addColorStop(1, THEME.seaBottom)
    }
    ctx.fillStyle = this._bgGrad
    ctx.fillRect(0, 0, w, h)
  }

  _drawBubbles(ctx) {
    for (const b of this.bubbles) {
      const sx = b.x + Math.sin(this.time * 0.0012 + b.phase) * 4
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath()
      ctx.arc(sx, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _drawHeader(ctx) {
    const { w, safeTop } = this.view

    // 返回按钮
    const b = this.backBtn
    roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2)
    ctx.fillStyle = THEME.orange
    ctx.fill()
    ctx.strokeStyle = 'rgba(212,108,78,0.55)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('返回', b.x + b.w / 2, b.y + b.h / 2 + 4.5)

    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText('成就', w / 2, safeTop + 26)
    ctx.fillStyle = THEME.inkSoft
    ctx.font = '12px sans-serif'
    ctx.fillText(`— ${achievedCount()} / ${ACHIEVEMENTS.length} 已解锁 —`, w / 2, safeTop + 48)
  }

  _drawList(ctx) {
    const { w } = this.view
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, this.listTop, w, this.listH)
    ctx.clip()
    ctx.translate(0, -this.scrollY)

    this.rows.forEach((row, i) => {
      const x = PAD
      const y = this.listTop + i * (ROW_H + GAP)
      if (y + ROW_H < this.listTop + this.scrollY - 12) return
      if (y > this.listTop + this.scrollY + this.listH + 12) return
      this._drawRow(ctx, x, y, this.rowW, ROW_H, row)
    })

    ctx.restore()
    this._drawScrollbar(ctx)
  }

  _drawRow(ctx, x, y, w, h, row) {
    const lit = row.unlocked

    // 卡片
    roundRectPath(ctx, x, y + 2, w, h, 14)
    ctx.fillStyle = THEME.shadowSoft
    ctx.fill()
    roundRectPath(ctx, x, y, w, h, 14)
    ctx.fillStyle = lit ? THEME.cream : THEME.creamDim
    ctx.fill()
    ctx.strokeStyle = lit ? THEME.butter : THEME.lockStroke
    ctx.lineWidth = lit ? 1.8 : 1.2
    ctx.stroke()

    // 左：奖章（未解锁是灰色剪影，解锁后奶油黄点亮）
    const cx = x + 30
    const cy = y + h / 2
    ctx.beginPath()
    ctx.arc(cx, cy, 21, 0, Math.PI * 2)
    ctx.fillStyle = lit ? THEME.butter : THEME.silhouette
    ctx.fill()
    this._drawIcon(ctx, row.icon, cx, cy, 11, lit ? THEME.brick : THEME.inkFaint)

    // 中：名称 + 描述（隐藏成就解锁前只显示 ？？？）
    const secret = row.hidden && !lit
    ctx.textAlign = 'left'
    ctx.fillStyle = lit ? THEME.ink : THEME.inkSoft
    ctx.font = 'bold 15px sans-serif'
    ctx.fillText(secret ? '？？？？？' : row.name, x + 60, y + 26)
    ctx.fillStyle = lit ? THEME.inkSoft : THEME.inkFaint
    ctx.font = '11.5px sans-serif'
    ctx.fillText(secret ? '隐藏成就 · 继续探索解锁' : row.desc, x + 60, y + 45)

    // 进度条 / 已解锁角标（隐藏成就不显示进度）
    const barX = x + 60
    const barW = w - 72 - 52
    const barY = y + h - 12
    if (secret) {
      ctx.textAlign = 'right'
      ctx.fillStyle = THEME.inkFaint
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('？？？', x + w - 12, y + 26)
    } else if (lit) {
      ctx.fillStyle = THEME.butter
      roundRectPath(ctx, barX, barY - 5, barW, 5, 2.5)
      ctx.fill()
      ctx.textAlign = 'right'
      ctx.fillStyle = THEME.brick
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('已达成', x + w - 12, y + 26)
    } else {
      ctx.fillStyle = 'rgba(38,77,89,0.10)'
      roundRectPath(ctx, barX, barY - 5, barW, 5, 2.5)
      ctx.fill()
      const k = clamp(row.cur / row.target, 0, 1)
      if (k > 0) {
        ctx.fillStyle = THEME.teal
        roundRectPath(ctx, barX, barY - 5, Math.max(5, barW * k), 5, 2.5)
        ctx.fill()
      }
      ctx.textAlign = 'right'
      ctx.fillStyle = THEME.inkFaint
      ctx.font = '11px sans-serif'
      ctx.fillText(`${Math.min(row.cur, row.target)} / ${row.target}`, x + w - 12, y + 26)
    }
  }

  /** 成就小图标（剪影单色，靠底色区分解锁态） */
  _drawIcon(ctx, type, cx, cy, r, color) {
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (type === 'star') {
      starPath(ctx, cx, cy, r, r * 0.43)
      ctx.fill()
    } else if (type === 'egg') {
      ctx.beginPath()
      ctx.ellipse(cx, cy + 1, r * 0.78, r, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (type === 'fish') {
      const u = r
      ctx.beginPath()
      ctx.moveTo(cx + u, cy)
      ctx.lineTo(cx - u * 0.7, cy - u * 0.62)
      ctx.lineTo(cx - u * 0.35, cy)
      ctx.lineTo(cx - u * 0.7, cy + u * 0.62)
      ctx.closePath()
      ctx.fill()
    } else if (type === 'crown') {
      ctx.beginPath()
      ctx.moveTo(cx - r, cy + r * 0.55)
      ctx.lineTo(cx - r, cy - r * 0.55)
      ctx.lineTo(cx - r * 0.35, cy - r * 0.05)
      ctx.lineTo(cx, cy - r * 0.7)
      ctx.lineTo(cx + r * 0.35, cy - r * 0.05)
      ctx.lineTo(cx + r, cy - r * 0.55)
      ctx.lineTo(cx + r, cy + r * 0.55)
      ctx.closePath()
      ctx.fill()
    } else {
      // palette：圆盘 + 三个色点（解锁后才点亮色点，未解锁保持灰剪影）
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      if (color === THEME.brick) {
        ctx.fillStyle = THEME.cream
        ;[[-0.32, -0.25], [0.3, -0.2], [0, 0.32]].forEach(([px, py]) => {
          ctx.beginPath()
          ctx.arc(cx + px * r, cy + py * r, r * 0.16, 0, Math.PI * 2)
          ctx.fill()
        })
      }
    }
  }

  _drawScrollbar(ctx) {
    if (this.maxScroll <= 0) return
    const x = this.view.w - 8
    const wBar = 5
    const thumbH = Math.max(36, this.listH * (this.listH / (this.listH + this.maxScroll)))
    const thumbY = this.listTop + (this.scrollY / this.maxScroll) * (this.listH - thumbH)

    roundRectPath(ctx, x, this.listTop, wBar, this.listH, wBar / 2)
    ctx.fillStyle = 'rgba(38,77,89,0.08)'
    ctx.fill()
    roundRectPath(ctx, x, thumbY, wBar, thumbH, wBar / 2)
    ctx.fillStyle = 'rgba(38,77,89,0.35)'
    ctx.fill()
  }
}

/** 标准五角星路径 */
function starPath(ctx, cx, cy, outer, inner) {
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 === 0 ? outer : inner
    const ang = -Math.PI / 2 + (k * Math.PI) / 5
    const px = cx + Math.cos(ang) * rad
    const py = cy + Math.sin(ang) * rad
    if (k === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}
