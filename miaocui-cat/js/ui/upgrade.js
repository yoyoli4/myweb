import {
  UPGRADE_LINES,
  UPGRADE_MAX,
  UPGRADE_COST,
  getEvolutionPoints,
  getUpgradeLevel,
  buyUpgrade
} from '../data/cats'
import { THEME } from '../core/theme'
import { clamp, roundRectPath } from '../core/util'

/**
 * 强化弹层（覆盖在探索区上）：
 *   游速 / 体型 / 连吃时间三条线，各 3 级，每级 2 进化点。
 *   满级按钮灰显“已满级”；点数不足显示“还差 X 点”。
 *   强化为全局属性，对所有猫生效，关闭后由探索场景刷新实际数值。
 */
export default class UpgradePanel {
  constructor(view) {
    this.view = view
    this.active = false
    this.onClose = null
    this.time = 0
    this.bump = {} // 购买成功的行弹跳计时 ms（key -> t 剩余）
    this._buildPanel()
  }

  open() {
    this.active = true
    this.time = 0
  }

  close() {
    this.active = false
    if (this.onClose) this.onClose()
  }

  _buildPanel() {
    const { w, h, safeTop, bottomInset } = this.view
    this.panel = {
      x: 24,
      y: safeTop + 12,
      w: w - 48,
      h: h - safeTop - 12 - Math.max(bottomInset, 12) - 12
    }
    // 关闭键放左上角（右上角留给系统胶囊）
    this.closeRect = { x: this.panel.x + 10, y: this.panel.y + 10, w: 28, h: 28 }
  }

  /** 三张行卡片的统一几何（渲染与触摸命中共用，禁止两处各算一套） */
  _rows() {
    const p = this.panel
    const top = p.y + 92
    const cardH = 92
    const gap = 12
    return UPGRADE_LINES.map((line, i) => {
      const y = top + i * (cardH + gap)
      return { line, x: p.x + 12, y, w: p.w - 24, h: cardH }
    })
  }

  /** 行内“升级”按钮热区 */
  _btnRect(row) {
    const bw = 92
    const bh = 36
    return { x: row.x + row.w - 14 - bw, y: row.y + (row.h - bh) / 2, w: bw, h: bh }
  }

  update(dt) {
    if (!this.active) return
    this.time += dt
    for (const k of Object.keys(this.bump)) {
      this.bump[k] -= dt
      if (this.bump[k] <= 0) delete this.bump[k]
    }
  }

  onTouchStart(x, y) {
    if (!this.active) return false
    const c = this.closeRect
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
      this.close()
      return true
    }
    const points = getEvolutionPoints()
    for (const row of this._rows()) {
      const b = this._btnRect(row)
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        const lv = getUpgradeLevel(row.line.key)
        if (lv >= UPGRADE_MAX) return true
        if (points < UPGRADE_COST) return true // 余额不足：吞掉触摸，不跳转不报错
        const res = buyUpgrade(row.line.key)
        if (res.ok) {
          this.bump[row.line.key] = 360
          if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
        }
        return true
      }
    }
    return true
  }

  onTouchMove() {}
  onTouchEnd() {}

  // ----------------------------------------------------------------
  render(ctx) {
    if (!this.active) return
    const { w, h } = this.view

    // 遮罩
    ctx.fillStyle = 'rgba(38,77,89,0.45)'
    ctx.fillRect(0, 0, w, h)

    const p = this.panel
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 22)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = THEME.seaLine
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 标题
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 19px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('猫咪强化', p.x + p.w / 2, p.y + 38)
    this._drawClose(ctx)

    // 进化点余额胶囊（标题下方居中，金边金星与探索区 HUD 同款）
    this._drawPoints(ctx, p)

    // 三条强化线
    for (const row of this._rows()) this._drawRow(ctx, row)

    // 底部说明
    ctx.fillStyle = THEME.inkSoft
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('强化对所有猫生效 · 换猫、重开都不丢失', p.x + p.w / 2, p.y + p.h - 18)
  }

  _drawClose(ctx) {
    const c = this.closeRect
    ctx.strokeStyle = THEME.inkSoft
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(c.x + 7, c.y + 7)
    ctx.lineTo(c.x + c.w - 7, c.y + c.h - 7)
    ctx.moveTo(c.x + c.w - 7, c.y + 7)
    ctx.lineTo(c.x + 7, c.y + c.h - 7)
    ctx.stroke()
  }

  _drawPoints(ctx, p) {
    const pts = getEvolutionPoints()
    const label = `进化点 ${pts}`
    ctx.font = 'bold 12px sans-serif'
    const tw = Math.ceil(ctx.measureText(label).width)
    const bw = tw + 40
    const bh = 24
    const bx = p.x + (p.w - bw) / 2
    const by = p.y + 52
    roundRectPath(ctx, bx, by, bw, bh, bh / 2)
    ctx.fillStyle = 'rgba(255,248,231,0.95)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,171,63,0.85)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    // 四角金星
    const sx = bx + 16
    const sy = by + bh / 2
    ctx.beginPath()
    ctx.moveTo(sx, sy - 6)
    ctx.lineTo(sx + 4.5, sy)
    ctx.lineTo(sx, sy + 6)
    ctx.lineTo(sx - 4.5, sy)
    ctx.closePath()
    ctx.fillStyle = THEME.butter
    ctx.fill()
    ctx.strokeStyle = '#d8ab3f'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = THEME.ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, sx + 9, sy + 0.5)
    ctx.textBaseline = 'alphabetic'
  }

  _drawIcon(ctx, key, cx, cy) {
    // 奶油圆盘底
    ctx.beginPath()
    ctx.arc(cx, cy, 23, 0, Math.PI * 2)
    ctx.fillStyle = THEME.creamDim
    ctx.fill()
    ctx.strokeStyle = 'rgba(67,151,141,0.55)'
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.strokeStyle = THEME.teal
    ctx.fillStyle = THEME.teal
    ctx.lineCap = 'round'
    if (key === 'speed') {
      // 闪电
      ctx.beginPath()
      ctx.moveTo(cx + 2, cy - 11)
      ctx.lineTo(cx - 6, cy + 2)
      ctx.lineTo(cx - 1, cy + 2)
      ctx.lineTo(cx - 2, cy + 11)
      ctx.lineTo(cx + 7, cy - 3)
      ctx.lineTo(cx + 2, cy - 3)
      ctx.closePath()
      ctx.fill()
    } else if (key === 'size') {
      // 大小同心圆
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(cx - 2, cy - 1, 9, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx + 5, cy + 5, 4.5, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      // 时钟（连吃窗口）
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.arc(cx, cy, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx, cy - 6)
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + 5, cy + 2)
      ctx.stroke()
    }
  }

  _drawRow(ctx, row) {
    const { line } = row
    const lv = getUpgradeLevel(line.key)
    const points = getEvolutionPoints()
    const maxed = lv >= UPGRADE_MAX

    roundRectPath(ctx, row.x, row.y, row.w, row.h, 16)
    ctx.fillStyle = THEME.creamDim
    ctx.fill()
    ctx.strokeStyle = 'rgba(67,151,141,0.35)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    this._drawIcon(ctx, line.key, row.x + 40, row.y + row.h / 2)

    const tx = row.x + 76
    // 名称
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(line.name, tx, row.y + 28)

    // 等级圆点（紧跟名称右侧）
    const nameW = ctx.measureText(line.name).width
    for (let i = 0; i < UPGRADE_MAX; i++) {
      const dotX = tx + nameW + 12 + i * 15
      const dotY = row.y + 23
      ctx.beginPath()
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2)
      if (i < lv) {
        ctx.fillStyle = THEME.orange
        ctx.fill()
      } else {
        ctx.fillStyle = 'rgba(38,77,89,0.12)'
        ctx.fill()
      }
    }

    // 说明 + 当前/下级效果
    ctx.fillStyle = THEME.inkSoft
    ctx.font = '11px sans-serif'
    ctx.fillText(line.desc, tx, row.y + 50)
    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = THEME.teal
    const cur = line.fmt(line.values[lv])
    const effectTxt = maxed
      ? `当前 ${cur}（已满级）`
      : `当前 ${cur} → 下级 ${line.fmt(line.values[lv + 1])}`
    ctx.fillText(effectTxt, tx, row.y + 70)

    // 右侧按钮
    const b = this._btnRect(row)
    const bumpT = this.bump[line.key] || 0
    let scale = 1
    if (bumpT > 0) scale = 1 + 0.1 * Math.sin((bumpT / 360) * Math.PI)
    ctx.save()
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2)
    ctx.scale(scale, scale)
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2))
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 18)
    let fill
    let stroke
    let txt
    let txtColor = THEME.cream
    if (maxed) {
      fill = 'rgba(38,77,89,0.14)'
      stroke = 'rgba(38,77,89,0.18)'
      txt = '已满级'
      txtColor = THEME.inkSoft
    } else if (points < UPGRADE_COST) {
      fill = 'rgba(212,108,78,0.28)'
      stroke = 'rgba(212,108,78,0.4)'
      txt = `还差 ${UPGRADE_COST - points} 点`
      txtColor = THEME.brick
    } else {
      fill = THEME.orange
      stroke = 'rgba(212,108,78,0.55)'
      txt = `升级 · ${UPGRADE_COST}点`
    }
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = txtColor
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(txt, b.x + b.w / 2, b.y + b.h / 2 + 0.5)
    ctx.textBaseline = 'alphabetic'
    ctx.restore()
  }
}
