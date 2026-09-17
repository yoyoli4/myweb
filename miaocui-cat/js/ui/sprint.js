import { THEME } from '../core/theme'
import { clamp } from '../core/util'

// ==================================================================
// 手动加速 · 配置区（所有手感数值集中在此，调整只动这里）
// ==================================================================
export const SPRINT_CONFIG = {
  mult: 2, // 加速倍率（默认 2 倍）
  multMax: 3, // 倍率硬上限：配置超过 3 也会被钳到 3
  duration: 5000, // 单次最长持续时间 ms（按住超时自动结束）
  cooldown: 10000 // 冷却时间 ms（一次加速结束后才进入冷却）
}

const READY = 'ready'
const ACTIVE = 'active'
const COOL = 'cool'
const TAU = Math.PI * 2

/**
 * 右下角手动加速按钮（纯 Canvas，无新美术依赖）。
 * 三态：
 *   ready   奶油底 + 青色闪电 + 呼吸微光，可触发
 *   active  主橙底 + 黄进度环（剩余可加速时间）+ 倒计时
 *   cool    灰化 + 青色恢复环 + 冷却秒数，按住无效
 * 规则：
 *   - 按住触发、松开立即结束并进冷却；
 *   - 持续超过 duration 自动结束进冷却，手指仍按着也不再加速；
 *   - 加速不可叠加、反复按不会刷新持续时间；
 *   - update(dt) 传 0 即暂停（孵化弹层 / 切后台），计时同步挂起。
 * 狂暴联动：forceAuto() 由肥猫狂暴触发时调用，代管为持续加速
 * （不倒计时、不冷却、不响应手动按下）；endAuto() 在狂暴结束时收口
 * 回手动规则，若玩家手指仍按着则无缝转为一次正常手动加速。
 * 触摸用 pointerId 锁定手指，与摇杆多指并存互不干扰；鼠标在开发者
 * 工具里被模拟成单触点（identifier 0），同一套逻辑天然兼容。
 */
export default class SprintButton {
  constructor(view) {
    this.mult = clamp(SPRINT_CONFIG.mult, 1, SPRINT_CONFIG.multMax)
    this.duration = SPRINT_CONFIG.duration
    this.cooldownMs = SPRINT_CONFIG.cooldown

    // 右下角圆形按钮：尺寸随屏宽缩放，避开底部安全区，右手拇指自然可及
    this.r = clamp(view.w * 0.092, 30, 38)
    this.cx = view.w - 22 - this.r
    this.cy = view.h - Math.max(view.bottomInset || 0, 12) - 18 - this.r

    this.state = READY
    this.auto = false // 狂暴代管中：持续加速，不受手动规则约束
    this.holdId = -1 // 正按住按钮的触点 id（-1 = 无）
    this.remain = 0 // 加速剩余 ms
    this.cool = 0 // 冷却剩余 ms
  }

  /** 触摸热区比视觉略大一圈，更好按 */
  hit(x, y) {
    return Math.hypot(x - this.cx, y - this.cy) <= this.r + 12
  }

  get active() {
    return this.state === ACTIVE
  }

  /** 1 = 正常速度；加速中返回配置倍率，移动系统只认这一个出口 */
  get speedMult() {
    return this.state === ACTIVE ? this.mult : 1
  }

  get pointerId() {
    return this.holdId
  }

  /** 按下：只有 ready 能触发；active/cool 按住一律无效 */
  press(id) {
    if (this.auto) return false // 狂暴代管中：按钮暂不响应手动触发
    if (this.state !== READY) return false
    this.state = ACTIVE
    this.remain = this.duration
    this.holdId = id
    return true
  }

  /** 抬起对应手指：加速中松手立即结束 → 冷却 */
  release(id) {
    if (id !== this.holdId) return
    this.holdId = -1
    if (this.auto) return // 狂暴代管中松手：只清手指，不进冷却
    if (this.state === ACTIVE) this._enterCooldown()
  }

  /** 外部强制收口（打开孵化弹层 / 切出场景）：当作松手处理 */
  forceRelease() {
    this.holdId = -1
    if (this.auto) return
    if (this.state === ACTIVE) this._enterCooldown()
  }

  /** 狂暴代管：强制进入加速态并清冷却，不受按住/超时/冷却规则约束 */
  forceAuto() {
    this.auto = true
    this.state = ACTIVE
    this.remain = this.duration // 进度环保持满格
    this.cool = 0
  }

  /** 狂暴结束收口：回手动规则；手指仍按着则无缝转为一次正常手动加速 */
  endAuto() {
    this.auto = false
    this.cool = 0
    if (this.holdId !== -1) {
      this.state = ACTIVE
      this.remain = this.duration
    } else {
      this.state = READY
      this.remain = 0
    }
  }

  _enterCooldown() {
    this.state = COOL
    this.cool = this.cooldownMs
  }

  /**
   * @param dt 帧时长 ms；传 0 表示暂停，持续/冷却计时全部挂起
   */
  update(dt) {
    if (dt <= 0) return
    if (this.auto) return // 狂暴代管：不倒计时、不冷却，收口由 endAuto 负责
    if (this.state === ACTIVE) {
      this.remain -= dt
      if (this.remain <= 0) {
        // 按住超过最长持续：自动结束进冷却（holdId 可仍占着，松手时只清手指）
        this.remain = 0
        this._enterCooldown()
      }
    } else if (this.state === COOL) {
      this.cool -= dt
      if (this.cool <= 0) {
        this.cool = 0
        this.state = READY
      }
    }
  }

  // ----------------------------------------------------------------
  render(ctx, time) {
    const { r, cx, cy } = this
    ctx.save()

    // 柔和投影（偏移圆，不用 shadowBlur）
    ctx.beginPath()
    ctx.arc(cx, cy + 3, r, 0, TAU)
    ctx.fillStyle = THEME.shadow
    ctx.fill()

    ctx.save()
    ctx.translate(cx, cy)
    let scale = 1
    if (this.state === READY) scale = 1 + 0.025 * Math.sin(time * 0.004)
    else if (this.state === ACTIVE) scale = 0.94 + 0.02 * Math.sin(time * 0.02)
    ctx.scale(scale, scale)

    // 底盘
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    if (this.state === READY) {
      ctx.fillStyle = THEME.cream
    } else if (this.state === ACTIVE) {
      ctx.fillStyle = THEME.orange
    } else {
      ctx.fillStyle = 'rgba(255,248,231,0.42)'
    }
    ctx.fill()
    ctx.lineWidth = this.state === ACTIVE ? 2.4 : 1.6
    ctx.strokeStyle =
      this.state === READY
        ? 'rgba(67,151,141,0.75)'
        : this.state === ACTIVE
          ? THEME.butter
          : THEME.lockStroke
    ctx.stroke()

    if (this.state === COOL) {
      // 冷却中：只显示深色倒计时秒数（配外圈青色恢复环，状态最清晰）
      ctx.fillStyle = THEME.ink
      ctx.font = 'bold 17px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(Math.ceil(this.cool / 1000)), 0, 1)
    } else {
      // 可用 / 加速中：闪电（加速中缩小上移给倒计时腾位置）
      if (this.state === ACTIVE) {
        if (this.auto) {
          // 狂暴代管：时长由狂暴倒计时控制，只亮大闪电不显示秒数
          this._bolt(ctx, r * 0.6, THEME.cream, -2)
        } else {
          this._bolt(ctx, r * 0.42, THEME.cream, -8)
          // 加速剩余秒数（整数倒计时，最后一秒仍显示 1）
          ctx.fillStyle = THEME.cream
          ctx.font = 'bold 14px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(Math.max(1, Math.ceil(this.remain / 1000))), 0, 10)
        }
      } else {
        this._bolt(ctx, r * 0.6, THEME.teal, -2)
      }
    }
    ctx.restore()

    // —— 进度环（画在底盘外沿，不参与按压缩放）——
    if (this.state === ACTIVE) {
      this._ring(ctx, THEME.butter, clamp(this.remain / this.duration, 0, 1))
    } else if (this.state === COOL) {
      // 恢复环：冷却走过的比例逐渐填满
      this._ring(ctx, THEME.teal, clamp(1 - this.cool / this.cooldownMs, 0, 1))
    }

    // 可用态：按钮下方小字提示
    if (this.state === READY) {
      ctx.fillStyle = 'rgba(255,248,231,0.9)'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText('加速', cx, cy + r + 15)
    }
    ctx.restore()
  }

  /** 外沿进度环：frac 为保留/恢复比例，从 12 点方向顺时针 */
  _ring(ctx, color, frac) {
    const { r, cx, cy } = this
    ctx.save()
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, cy, r + 3.5, 0, TAU)
    ctx.strokeStyle = 'rgba(38,77,89,0.14)'
    ctx.lineWidth = 3.5
    ctx.stroke()
    if (frac > 0.001) {
      ctx.beginPath()
      ctx.arc(cx, cy, r + 3.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
      ctx.strokeStyle = color
      ctx.lineWidth = 3.5
      ctx.stroke()
    }
    ctx.restore()
  }

  /** 闪电图标，cyOff 为纵向偏移（加速中给倒计时让位） */
  _bolt(ctx, h, color, cyOff = -2) {
    ctx.beginPath()
    ctx.moveTo(-0.26 * h, -0.62 * h + cyOff)
    ctx.lineTo(0.14 * h, -0.62 * h + cyOff)
    ctx.lineTo(-0.03 * h, -0.08 * h + cyOff)
    ctx.lineTo(0.3 * h, -0.08 * h + cyOff)
    ctx.lineTo(-0.1 * h, 0.62 * h + cyOff)
    ctx.lineTo(0.05 * h, 0.1 * h + cyOff)
    ctx.lineTo(-0.3 * h, 0.1 * h + cyOff)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }
}
