import { clamp } from '../core/util'
import { THEME } from '../core/theme'

/**
 * 动态虚拟摇杆：手指在屏幕下半区按下时，底盘在触点处出现；
 * 拖动距离归一化为 -1~1 的方向向量，松手消失。
 * 通过 activeId 锁定手指，和顶部按钮互不干扰。
 */
export default class Joystick {
  constructor() {
    this.baseR = 56
    this.knobR = 24
    this.active = false
    this.activeId = -1
    this.bx = 0
    this.by = 0
    this.kx = 0
    this.ky = 0
  }

  attach(x, y, id) {
    this.active = true
    this.activeId = id
    this.bx = x
    this.by = y
    this.kx = x
    this.ky = y
  }

  move(x, y) {
    if (!this.active) return
    let dx = x - this.bx
    let dy = y - this.by
    const d = Math.hypot(dx, dy)
    if (d > this.baseR) {
      dx = (dx / d) * this.baseR
      dy = (dy / d) * this.baseR
    }
    this.kx = this.bx + dx
    this.ky = this.by + dy
  }

  release() {
    this.active = false
    this.activeId = -1
  }

  /** 归一化方向向量，magnitude 0~1（可当速度倍率） */
  get vector() {
    if (!this.active) return { x: 0, y: 0 }
    return {
      x: clamp((this.kx - this.bx) / this.baseR, -1, 1),
      y: clamp((this.ky - this.by) / this.baseR, -1, 1)
    }
  }

  render(ctx) {
    if (!this.active) return

    ctx.save()
    ctx.lineCap = 'round'

    // 底盘
    ctx.beginPath()
    ctx.arc(this.bx, this.by, this.baseR, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,248,231,0.35)'
    ctx.fill()
    ctx.strokeStyle = THEME.seaLine
    ctx.lineWidth = 2
    ctx.stroke()

    // 方向小十字（极淡）
    ctx.strokeStyle = 'rgba(38,77,89,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(this.bx - this.baseR + 10, this.by)
    ctx.lineTo(this.bx + this.baseR - 10, this.by)
    ctx.moveTo(this.bx, this.by - this.baseR + 10)
    ctx.lineTo(this.bx, this.by + this.baseR - 10)
    ctx.stroke()

    // 摇杆头（主橙 + 奶油白边）
    ctx.beginPath()
    ctx.arc(this.kx, this.ky, this.knobR, 0, Math.PI * 2)
    ctx.fillStyle = THEME.orange
    ctx.fill()
    ctx.strokeStyle = THEME.cream
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.restore()
  }
}
