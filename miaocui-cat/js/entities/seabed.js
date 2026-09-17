import { THEME } from '../core/theme'

/**
 * 无限海底装饰系统（2D 俯视角）。
 *
 * 世界被切成确定性网格（同一格坐标永远生成同样的装饰），
 * 每帧只枚举镜头周围的格子，因此海底无限延伸、零存档、零对象池漂移。
 *
 * 三层视差：
 *   far  0.32 —— 沙地亮斑、小石子（最远景，滚动最慢）
 *   mid  0.62 —— 远处小草丛 / 小珊瑚（半透明，无碰撞）
 *   near 1.00 —— 海草丛、珊瑚、海葵、岩石（真实世界层，大珊瑚/岩石有碰撞）
 */

const FAR = { factor: 0.32, chunk: 360, salt: 0x9e37 }
const MID = { factor: 0.62, chunk: 300, salt: 0x51ed }
const NEAR = { factor: 1, chunk: 300, salt: 0x7a11 }

// ---------------------------------------------------------------- 确定性随机
function hash2(cx, cy, salt) {
  let h = Math.imul(cx | 0, 2654435761) ^ Math.imul(cy | 0, 2246822519) ^ Math.imul(salt, 3266489917)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- 装饰生成
/**
 * 每个 near 格最多一个主体装饰（有时留空作泳道），
 * 另有小概率带一株伴生小草。
 * 返回 null 表示该格为空。
 */
function genNear(cx, cy) {
  const rng = mulberry32(hash2(cx, cy, NEAR.salt))
  const baseX = cx * NEAR.chunk + NEAR.chunk / 2
  const baseY = cy * NEAR.chunk + NEAR.chunk / 2
  const jitter = NEAR.chunk * 0.3
  const x = baseX + (rng() - 0.5) * 2 * jitter
  const y = baseY + (rng() - 0.5) * 2 * jitter
  const phase = rng() * Math.PI * 2
  const roll = rng()

  let item
  if (roll < 0.27) {
    // 海草丛（可从上方游过，无碰撞，靠摆动制造层次）
    item = { type: 'grass', x, y, s: 54 + rng() * 34, phase, collide: 0 }
  } else if (roll < 0.52) {
    // 分枝珊瑚（实体障碍）：整体放大，像从海底长出来的大家伙
    item = {
      type: 'coral',
      x,
      y,
      s: 92 + rng() * 56,
      phase,
      variant: rng() < 0.68 ? 'warm' : 'cool',
      collide: 1
    }
    item.r = item.s * 0.3
  } else if (roll < 0.72) {
    // 圆岩石（实体障碍）
    item = { type: 'rock', x, y, s: 44 + rng() * 32, phase, collide: 1 }
    item.r = item.s * 0.42
  } else if (roll < 0.86) {
    // 海葵（无碰撞，色彩点缀）
    item = { type: 'anemone', x, y, s: 34 + rng() * 18, phase, collide: 0 }
  } else {
    return null
  }

  // 伴生小草
  if (rng() < 0.3) {
    item.bud = {
      dx: (rng() - 0.5) * item.s * 1.5,
      dy: (rng() - 0.5) * item.s * 1.5,
      s: 22 + rng() * 14
    }
  }
  return item
}

function genMid(cx, cy) {
  const rng = mulberry32(hash2(cx, cy, MID.salt))
  if (rng() < 0.32) return null
  const x = cx * MID.chunk + MID.chunk / 2 + (rng() - 0.5) * MID.chunk * 0.6
  const y = cy * MID.chunk + MID.chunk / 2 + (rng() - 0.5) * MID.chunk * 0.6
  return {
    type: rng() < 0.7 ? 'grassFar' : 'coralFar',
    x,
    y,
    s: 24 + rng() * 18,
    phase: rng() * Math.PI * 2
  }
}

function genFar(cx, cy) {
  const rng = mulberry32(hash2(cx, cy, FAR.salt))
  const x = cx * FAR.chunk + FAR.chunk / 2 + (rng() - 0.5) * FAR.chunk * 0.7
  const y = cy * FAR.chunk + FAR.chunk / 2 + (rng() - 0.5) * FAR.chunk * 0.7
  const items = []
  if (rng() < 0.85) {
    items.push({ type: 'sand', x, y, s: 120 + rng() * 120, phase: rng() * Math.PI * 2 })
  }
  if (rng() < 0.45) {
    items.push({ type: 'pebbles', x: x + (rng() - 0.5) * 120, y: y + (rng() - 0.5) * 90, s: 14 + rng() * 10 })
  }
  return items
}

// ---------------------------------------------------------------- 纯绘制函数
function drawGrass(ctx, s, time, phase, alpha) {
  const blades = 7
  ctx.save()
  ctx.globalAlpha = alpha == null ? 1 : alpha
  ctx.lineCap = 'round'
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + phase * 0.3
    const len = s * (0.42 + 0.18 * Math.sin(phase + i * 1.7))
    const sway = Math.sin(time * 0.0011 + phase + i) * s * 0.05
    const ex = Math.cos(a) * len
    const ey = Math.sin(a) * len
    ctx.strokeStyle = i % 2 ? THEME.grassA : THEME.grassB
    ctx.lineWidth = s * 0.1
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(
      Math.cos(a + 0.5) * len * 0.45 + sway,
      Math.sin(a + 0.5) * len * 0.45,
      ex,
      ey
    )
    ctx.stroke()
  }
  // 根部小圆
  ctx.fillStyle = THEME.grassB
  ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.5
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function branch(ctx, x, y, len, ang, width, depth, rng, body, tip) {
  const x2 = x + Math.cos(ang) * len
  const y2 = y + Math.sin(ang) * len
  ctx.strokeStyle = body
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  if (depth <= 0) {
    ctx.fillStyle = tip
    ctx.beginPath()
    ctx.arc(x2, y2, width * 0.75, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const spread = 0.45 + rng() * 0.35
  branch(ctx, x2, y2, len * 0.62, ang - spread, width * 0.7, depth - 1, rng, body, tip)
  branch(ctx, x2, y2, len * 0.62, ang + spread, width * 0.7, depth - 1, rng, body, tip)
}

/** 珊瑚枝干：同一随机种子保证明暗两遍形状完全重合 */
function drawCoralBranches(ctx, s, phase, bodyCol, tipCol, baseW) {
  const rng = mulberry32(((phase || 0) * 1e6) ^ ((s * 100) | 0))
  ctx.fillStyle = bodyCol
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.09, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4
    branch(ctx, 0, 0, s * 0.3, ang, baseW, 2, rng, bodyCol, tipCol)
  }
}

function drawCoral(ctx, s, variant, phase, rich = true) {
  const warm = variant === 'warm'
  const body = warm ? THEME.orange : THEME.teal
  const tip = warm ? THEME.brick : THEME.grassA

  ctx.save()
  ctx.lineJoin = 'round'

  // 底部投影：贴着海底的一圈暗影，越靠根越实
  ctx.fillStyle = 'rgba(38,77,89,0.1)'
  ctx.beginPath()
  ctx.ellipse(s * 0.02, s * 0.08, s * 0.44, s * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(38,77,89,0.22)'
  ctx.beginPath()
  ctx.ellipse(s * 0.04, s * 0.1, s * 0.28, s * 0.13, 0, 0, Math.PI * 2)
  ctx.fill()

  if (rich) {
    // 背光面：整棵向下偏移画一遍暗色，形成下暗上亮的体积感
    ctx.save()
    ctx.translate(s * 0.035, s * 0.055)
    drawCoralBranches(ctx, s, phase, warm ? 'rgba(150,66,48,0.85)' : 'rgba(38,84,79,0.85)', warm ? '#A04A37' : '#2B5450', s * 0.075)
    ctx.restore()

    // 主体
    drawCoralBranches(ctx, s, phase, body, tip, s * 0.075)

    // 受光面：向左上偏移画一遍细高光，模拟水面打下来的光
    ctx.save()
    ctx.translate(-s * 0.02, -s * 0.035)
    drawCoralBranches(ctx, s, phase, warm ? 'rgba(255,224,180,0.7)' : 'rgba(228,248,244,0.6)', warm ? '#F9AD6A' : '#8FC4BC', s * 0.03)
    ctx.restore()
  } else {
    // 远景简化版：单遍绘制
    drawCoralBranches(ctx, s, phase, body, tip, s * 0.075)
  }

  ctx.restore()
}

function drawRock(ctx, s) {
  ctx.save()
  // 投影
  ctx.fillStyle = THEME.lockStroke
  ctx.beginPath()
  ctx.ellipse(s * 0.06, s * 0.1, s * 0.42, s * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  // 主体两块
  ctx.fillStyle = THEME.inkFaint
  ctx.beginPath()
  ctx.arc(-s * 0.08, -s * 0.04, s * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(s * 0.14, s * 0.06, s * 0.22, 0, Math.PI * 2)
  ctx.fill()
  // 暗部
  ctx.fillStyle = 'rgba(38,77,89,0.12)'
  ctx.beginPath()
  ctx.arc(s * 0.02, s * 0.14, s * 0.2, 0, Math.PI * 2)
  ctx.fill()
  // 高光
  ctx.fillStyle = 'rgba(255,248,231,0.7)'
  ctx.beginPath()
  ctx.ellipse(-s * 0.16, -s * 0.14, s * 0.1, s * 0.06, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawAnemone(ctx, s, time, phase) {
  ctx.save()
  ctx.lineCap = 'round'
  const sway = Math.sin(time * 0.0014 + phase) * 0.06
  // 外触手（主橙）
  ctx.strokeStyle = 'rgba(249,173,106,0.85)'
  ctx.lineWidth = s * 0.07
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const ex = Math.cos(a + sway) * s * 0.42
    const ey = Math.sin(a + sway) * s * 0.42
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, ex, ey)
    ctx.stroke()
  }
  // 内触手（奶油黄）
  ctx.strokeStyle = 'rgba(249,224,127,0.9)'
  ctx.lineWidth = s * 0.05
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3
    const ex = Math.cos(a - sway) * s * 0.26
    const ey = Math.sin(a - sway) * s * 0.26
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(ex, ey)
    ctx.stroke()
  }
  // 芯
  ctx.fillStyle = THEME.cream
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = THEME.seaLine
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.restore()
}

function drawSandPatch(ctx, s, phase) {
  ctx.save()
  ctx.fillStyle = 'rgba(249,224,127,0.14)'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.55, s * 0.36, phase * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,248,231,0.22)'
  ctx.beginPath()
  ctx.ellipse(-s * 0.08, -s * 0.05, s * 0.34, s * 0.2, phase * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawPebbles(ctx, s, phase) {
  ctx.save()
  ctx.fillStyle = 'rgba(38,77,89,0.13)'
  for (let i = 0; i < 4; i++) {
    const a = phase + (i / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.ellipse(Math.cos(a) * s, Math.sin(a) * s * 0.7, s * 0.28, s * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// ---------------------------------------------------------------- 海底管理
export default class Seabed {
  constructor(view) {
    this.view = view
  }

  /** 枚举某视差层在镜头内的所有格子 */
  _visibleChunks(layer, camX, camY) {
    const cx = camX * layer.factor
    const cy = camY * layer.factor
    // 层空间坐标 L 的屏上位置 = L - cam*factor + 屏半宽，可见半幅就是屏半宽
    const halfW = this.view.w / 2 + layer.chunk
    const halfH = this.view.h / 2 + layer.chunk
    return {
      x0: Math.floor((cx - halfW) / layer.chunk),
      x1: Math.floor((cx + halfW) / layer.chunk),
      y0: Math.floor((cy - halfH) / layer.chunk),
      y1: Math.floor((cy + halfH) / layer.chunk),
      cx,
      cy
    }
  }

  /** 远、中两层视差装饰（屏幕坐标系，自行换算） */
  renderParallax(ctx, camX, camY, time) {
    // ---- far ----
    {
      const box = this._visibleChunks(FAR, camX, camY)
      const ox = this.view.w / 2 - box.cx
      const oy = this.view.h / 2 - box.cy
      for (let gy = box.y0; gy <= box.y1; gy++) {
        for (let gx = box.x0; gx <= box.x1; gx++) {
          const items = genFar(gx, gy)
          for (const it of items) {
            const sx = it.x + ox
            const sy = it.y + oy
            ctx.save()
            ctx.translate(sx, sy)
            if (it.type === 'sand') drawSandPatch(ctx, it.s, it.phase)
            else drawPebbles(ctx, it.s, it.phase)
            ctx.restore()
          }
        }
      }
    }
    // ---- mid ----
    {
      const box = this._visibleChunks(MID, camX, camY)
      const ox = this.view.w / 2 - box.cx
      const oy = this.view.h / 2 - box.cy
      for (let gy = box.y0; gy <= box.y1; gy++) {
        for (let gx = box.x0; gx <= box.x1; gx++) {
          const it = genMid(gx, gy)
          if (!it) continue
          ctx.save()
          ctx.translate(it.x + ox, it.y + oy)
          if (it.type === 'grassFar') drawGrass(ctx, it.s, time, it.phase, 0.5)
          else {
            ctx.globalAlpha = 0.55
            drawCoral(ctx, it.s, (it.phase * 100 | 0) % 2 ? 'warm' : 'cool', it.phase, false)
          }
          ctx.restore()
        }
      }
    }
  }

  /** near 层（世界坐标系内调用，ctx 已平移到摄像机） */
  renderNear(ctx, camX, camY, time) {
    const box = this._visibleChunks(NEAR, camX, camY)
    for (let gy = box.y0; gy <= box.y1; gy++) {
      for (let gx = box.x0; gx <= box.x1; gx++) {
        const it = genNear(gx, gy)
        if (!it) continue
        ctx.save()
        ctx.translate(it.x, it.y)
        if (it.type === 'grass') {
          drawGrass(ctx, it.s, time, it.phase, 1)
        } else if (it.type === 'coral') {
          drawCoral(ctx, it.s, it.variant, it.phase)
        } else if (it.type === 'rock') {
          drawRock(ctx, it.s)
        } else {
          drawAnemone(ctx, it.s, time, it.phase)
        }
        if (it.bud) {
          ctx.save()
          ctx.translate(it.bud.dx, it.bud.dy)
          drawGrass(ctx, it.bud.s, time, it.phase + 1.3, 0.85)
          ctx.restore()
        }
        ctx.restore()
      }
    }
  }

  /**
   * 碰撞解算：把圆形 (x,y,r) 从珊瑚/岩石里推出来。
   * 两轮迭代处理同时挨着两个障碍的情况。
   */
  resolveCollision(x, y, r) {
    for (let pass = 0; pass < 2; pass++) {
      const cx0 = Math.floor((x - r - 48) / NEAR.chunk)
      const cx1 = Math.floor((x + r + 48) / NEAR.chunk)
      const cy0 = Math.floor((y - r - 48) / NEAR.chunk)
      const cy1 = Math.floor((y + r + 48) / NEAR.chunk)
      for (let gy = cy0; gy <= cy1; gy++) {
        for (let gx = cx0; gx <= cx1; gx++) {
          const it = genNear(gx, gy)
          if (!it || !it.collide) continue
          let dx = x - it.x
          let dy = y - it.y
          const minD = r + it.r
          const d2 = dx * dx + dy * dy
          if (d2 < minD * minD) {
            const d = Math.sqrt(d2) || 0.001
            if (d2 < 0.0001) dx = 1
            x = it.x + (dx / d) * minD
            y = it.y + (dy / d) * minD
          }
        }
      }
    }
    return { x, y }
  }
}
