import { makeSprite } from '../render/sprite'
import { THEME } from '../core/theme'
import { rand } from '../core/util'

/**
 * 鱼鱼：圆润泪滴形，尖嘴朝 +x 方向绘制。
 * 鱼色只决定经验，与猫的颜色 / 解锁完全无关：
 *   绿 / 黄 +10，蓝 / 粉 +25，紫 / 金 +50
 * weight 为刷新权重（绿黄最常见，紫金最稀有）。
 */
export const FISH_COLORS = [
  { key: 'green', body: '#9cd8b0', dark: '#6fbf8e', exp: THEME.expNormal, weight: 30 },
  { key: 'yellow', body: '#f8df8e', dark: '#eac766', exp: THEME.expNormal, weight: 30 },
  { key: 'blue', body: '#93cce9', dark: '#63add6', exp: THEME.expRare, weight: 15 },
  { key: 'pink', body: '#f8b9d1', dark: '#e893b5', exp: THEME.expRare, weight: 15 },
  { key: 'purple', body: '#c3a9ec', dark: '#9f82d6', exp: THEME.expEpic, weight: 5 },
  { key: 'gold', body: '#f0cf6e', dark: '#d6a93e', exp: THEME.expEpic, weight: 5 }
]

const FISH_WEIGHT_SUM = FISH_COLORS.reduce((a, c) => a + c.weight, 0)

/** 按刷新权重随机挑一种鱼色 */
function rollFishColor() {
  let r = Math.random() * FISH_WEIGHT_SUM
  for (let i = 0; i < FISH_COLORS.length; i++) {
    r -= FISH_COLORS[i].weight
    if (r <= 0) return i
  }
  return 0
}

const SPRITE_SIZE = 52

// 逃跑参数：猫游速 0.24px/ms，鱼逃速明显更低（靠 150px 提前量求生）
const FLEE_RADIUS = 150 // 感知圈（世界 px）
const FLEE_MS = 1300 // 猫离开后继续冲刺的时间
const FLEE_SPEED_MIN = 0.08
const FLEE_SPEED_MAX = 0.15

/** 预渲染六色鱼 sprite（静态图，帧循环只 drawImage） */
export function makeFishSprites(dpr) {
  return FISH_COLORS.map((c) =>
    makeSprite(SPRITE_SIZE, dpr, (g, s) => drawFish(g, s, c.body, c.dark))
  )
}

/** 纯函数画鱼，以 (0,0) 为中心，尖嘴朝右 */
export function drawFish(ctx, s, body, dark) {
  const u = (s / 2) * 0.92
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // 圆润的泪滴形身体：鼓背圆腹、吻部圆钝，全程无绝对锐角
  ctx.beginPath()
  ctx.moveTo(0.88 * u, 0)
  ctx.quadraticCurveTo(0.86 * u, -0.3 * u, 0.4 * u, -0.5 * u)
  ctx.quadraticCurveTo(0, -0.64 * u, -0.42 * u, -0.34 * u)
  ctx.quadraticCurveTo(-0.6 * u, -0.18 * u, -0.6 * u, 0)
  ctx.quadraticCurveTo(-0.6 * u, 0.18 * u, -0.42 * u, 0.34 * u)
  ctx.quadraticCurveTo(0, 0.64 * u, 0.4 * u, 0.5 * u)
  ctx.quadraticCurveTo(0.86 * u, 0.3 * u, 0.88 * u, 0)
  ctx.closePath()
  ctx.fillStyle = body
  ctx.fill()
  ctx.strokeStyle = 'rgba(38,77,89,0.35)'
  ctx.lineWidth = 0.04 * u
  ctx.stroke()

  // 双圆叶尾巴：叶尖全部走弧线
  ctx.beginPath()
  ctx.moveTo(-0.52 * u, 0)
  ctx.quadraticCurveTo(-0.82 * u, -0.16 * u, -0.96 * u, -0.42 * u)
  ctx.quadraticCurveTo(-1.02 * u, -0.18 * u, -0.78 * u, 0)
  ctx.quadraticCurveTo(-1.02 * u, 0.18 * u, -0.96 * u, 0.42 * u)
  ctx.quadraticCurveTo(-0.82 * u, 0.16 * u, -0.52 * u, 0)
  ctx.closePath()
  ctx.fillStyle = body
  ctx.fill()
  ctx.stroke()

  // 背上一道浅色高光（弧形，贴合鼓背）
  ctx.beginPath()
  ctx.moveTo(0.52 * u, -0.12 * u)
  ctx.quadraticCurveTo(0.1 * u, -0.44 * u, -0.3 * u, -0.32 * u)
  ctx.quadraticCurveTo(0.04 * u, -0.2 * u, 0.18 * u, -0.05 * u)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fill()

  // 小鳍
  ctx.beginPath()
  ctx.moveTo(-0.05 * u, 0.02 * u)
  ctx.quadraticCurveTo(-0.28 * u, 0.3 * u, -0.4 * u, 0.28 * u)
  ctx.quadraticCurveTo(-0.22 * u, 0.12 * u, 0.02 * u, 0.1 * u)
  ctx.closePath()
  ctx.fillStyle = dark
  ctx.globalAlpha = 0.55
  ctx.fill()
  ctx.globalAlpha = 1

  // 大眼睛（占脸比例大，憨）
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0.32 * u, -0.12 * u, 0.14 * u, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = THEME.ink
  ctx.beginPath()
  ctx.arc(0.36 * u, -0.12 * u, 0.085 * u, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0.39 * u, -0.16 * u, 0.032 * u, 0, Math.PI * 2)
  ctx.fill()

  // 微笑
  ctx.strokeStyle = 'rgba(38,77,89,0.55)'
  ctx.lineWidth = 0.03 * u
  ctx.beginPath()
  ctx.arc(0.5 * u, 0.08 * u, 0.1 * u, 0.15 * Math.PI, 0.7 * Math.PI)
  ctx.stroke()

  ctx.restore()
}

/**
 * 一条会随机游荡的鱼（世界坐标，无边界）。
 * 可以自由游出画面；离玩家太远（约一屏多）时，
 * 在镜头外的圆环上换个位置重新游入，等同于“从另一侧重新出现”。
 */
export class Fish {
  constructor(sprites, view, player) {
    this.sprites = sprites
    this.colorIndex = rollFishColor()
    this.view = view
    this.player = player
    this.size = SPRITE_SIZE
    this.r = 17 // 碰撞半径
    this.alive = true
    this.respawnIn = 0
    this.wobble = rand(0, Math.PI * 2) // 摆尾相位
    this.wavePhase = rand(0, Math.PI * 2) // 蛇形游动相位
    this.swimAngle = 0
    this.fleeing = false // 逃跑态
    this.fleeT = 0
    this.fleeBias = 0 // 逃跑方向上的随机偏摆（避免只会笔直逃）
    this.fleeBiasT = 0
    this._retire = false // 狂暴退场：径直游离镜头
    this._gone = false // 已出镜，等待场景从鱼群中回收
    this._spawnInView()
  }

  /** 镜头视野的外接圆半径（世界单位） */
  get _viewR() {
    return Math.hypot(this.view.w, this.view.h) / 2
  }

  /** 当前鱼色 sprite / 被吃提供的经验 */
  get sprite() {
    return this.sprites[this.colorIndex]
  }

  get expValue() {
    return FISH_COLORS[this.colorIndex].exp
  }

  /** 本条鱼的颜色 key（成就"尝遍大海"用） */
  get colorKey() {
    return FISH_COLORS[this.colorIndex].key
  }

  /** 初始 / 被吃后：撒在当前镜头内、离玩家有距离的位置 */
  _spawnInView() {
    const p = this.player
    for (let tries = 0; tries < 12; tries++) {
      this.x = p.x + rand(-this.view.w / 2 + 40, this.view.w / 2 - 40)
      this.y = p.y + rand(-this.view.h / 2 + 80, this.view.h / 2 - 40)
      if (Math.hypot(this.x - p.x, this.y - p.y) > 150) break
    }
    this._newHeading(rand(0, Math.PI * 2))
  }

  /** 在镜头外的圆环上重生，朝玩家方向游回来 */
  _spawnAtEdge() {
    const p = this.player
    this.fleeing = false
    this.fleeT = 0
    const ang = rand(0, Math.PI * 2)
    const d = this._viewR + rand(40, 190)
    this.x = p.x + Math.cos(ang) * d
    this.y = p.y + Math.sin(ang) * d
    // 朝玩家，带随机偏角，不会每条都笔直冲脸
    let toP = Math.atan2(p.y - this.y, p.x - this.x) + rand(-0.85, 0.85)
    this._newHeading(toP)
  }

  _newHeading(a) {
    this.angle = a
    this.targetAngle = a
    this.swimAngle = a
    this.speed = rand(0.05, 0.095) // px/ms
    this.turnIn = rand(900, 2800)
  }

  /** 被吃掉：延时后在镜头外重生，再游回来 */
  kill() {
    this.alive = false
    this.respawnIn = 900
    this.fleeing = false
    this.fleeT = 0
  }

  update(dt, time) {
    if (!this.alive) {
      this.respawnIn -= dt
      if (this.respawnIn <= 0) {
        this.alive = true
        this.colorIndex = rollFishColor() // 重新刷出一条（颜色按权重重roll）
        this._spawnAtEdge()
      }
      return
    }

    // —— 感知猫：进入感知圈立刻冲刺逃离；威胁持续则续期 ——
    const p = this.player
    const dx = this.x - p.x
    const dy = this.y - p.y
    const dist = Math.hypot(dx, dy)

    // 狂暴结束的增援鱼：忽略游荡与逃跑，径直游离镜头，出镜后由场景回收
    if (this._retire) {
      const away = Math.atan2(dy, dx)
      let diff = away - this.angle
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.angle += diff * Math.min(1, dt / 120)
      this.swimAngle = this.angle
      this.wavePhase += dt * 0.02
      this.x += Math.cos(this.angle) * 0.16 * dt
      this.y += Math.sin(this.angle) * 0.16 * dt
      if (Math.hypot(this.x - p.x, this.y - p.y) > this._viewR + 220) this._gone = true
      return
    }

    if (dist < FLEE_RADIUS) {
      if (!this.fleeing) {
        this.fleeing = true
        this.speed = rand(FLEE_SPEED_MIN, FLEE_SPEED_MAX)
        this.fleeBias = rand(-0.35, 0.35)
        this.fleeBiasT = 0
      }
      this.fleeT = FLEE_MS
    }

    if (this.fleeing) {
      this.fleeT -= dt
      // 逃跑偏摆定期刷新，路线不是死板直线（也不会抖到朝向猫）
      this.fleeBiasT -= dt
      if (this.fleeBiasT <= 0) {
        this.fleeBias = rand(-0.35, 0.35)
        this.fleeBiasT = rand(260, 520)
      }
      this.targetAngle = Math.atan2(dy, dx) + this.fleeBias
      // 威胁消失且冲刺结束 → 恢复普通游荡速度
      if (this.fleeT <= 0) {
        this.fleeing = false
        this._newHeading(this.angle)
      }
    } else {
      this.turnIn -= dt
      if (this.turnIn <= 0) {
        // 平滑转向一个新方向
        this.targetAngle += rand(-1.4, 1.4)
        this.turnIn = rand(900, 2800)
      }
    }

    // 角度插值（处理 -π/π 跳变）：逃跑时转向更急
    let diff = this.targetAngle - this.angle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.angle += diff * Math.min(1, dt / (this.fleeing ? 110 : 320))

    // 蛇形曲线游动：主航向上叠加正弦偏航，游得越快波动越密；
    // 逃跑时收窄偏航幅度，逃线更直、更有效
    this.wavePhase += dt * (0.005 + this.speed * 0.03)
    this.swimAngle = this.angle + Math.sin(this.wavePhase) * (this.fleeing ? 0.12 : 0.3)
    this.x += Math.cos(this.swimAngle) * this.speed * dt
    this.y += Math.sin(this.swimAngle) * this.speed * dt

    // 游离镜头太远 → 镜头外随机位置重新出现
    if (dist > this._viewR + 220) {
      this._spawnAtEdge()
    }
  }

  render(ctx, time) {
    if (!this.alive) return
    // 摆尾节律：逃跑时摆尾更快更夸张（慌张），平时舒缓
    const freq = this.fleeing ? 0.026 : 0.014
    const headAmp = this.fleeing ? 0.13 : 0.08
    const bodyAmp = this.fleeing ? 0.09 : 0.05
    const beat = Math.sin(time * freq + this.wobble)
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.swimAngle + beat * headAmp)
    ctx.scale(1, 1 + beat * bodyAmp) // 贴图朝 +x，Y 轴压扁即身体横向扭动
    ctx.drawImage(this.sprite, -this.size / 2, -this.size / 2, this.size, this.size)
    ctx.restore()
  }
}
