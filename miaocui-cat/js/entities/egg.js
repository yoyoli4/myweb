import { THEME } from '../core/theme'

/**
 * 蛋蛋：奶油白蛋壳 + 主橙/深海青波点花纹。
 * 以 (0,0) 为中心，s 为外接框边长绘制。
 * crackStage: 0 完整 / 1 一道裂缝 / 2 网状裂缝
 */
export function drawEgg(ctx, s, crackStage) {
  const u = (s / 2) * 0.92

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // 蛋形路径（上窄下宽）
  eggPath(ctx, u)
  ctx.fillStyle = THEME.cream
  ctx.fill()

  // 花纹裁剪在蛋壳内
  ctx.save()
  eggPath(ctx, u)
  ctx.clip()
  // 主橙波点
  ctx.fillStyle = 'rgba(249,173,106,0.85)'
  dot(ctx, -0.28 * u, -0.34 * u, 0.1 * u)
  dot(ctx, 0.24 * u, -0.1 * u, 0.12 * u)
  dot(ctx, -0.1 * u, 0.22 * u, 0.09 * u)
  dot(ctx, 0.3 * u, 0.4 * u, 0.08 * u)
  // 深海青小波点
  ctx.fillStyle = 'rgba(67,151,141,0.8)'
  dot(ctx, 0.02 * u, -0.42 * u, 0.06 * u)
  dot(ctx, -0.36 * u, 0.06 * u, 0.07 * u)
  dot(ctx, 0.12 * u, 0.5 * u, 0.06 * u)
  // 底部淡奶油黄带
  ctx.fillStyle = 'rgba(249,224,127,0.55)'
  ctx.beginPath()
  ctx.ellipse(0, 0.62 * u, 0.5 * u, 0.22 * u, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  eggPath(ctx, u)
  ctx.strokeStyle = 'rgba(38,77,89,0.3)'
  ctx.lineWidth = 0.035 * u
  ctx.stroke()

  // 裂缝
  if (crackStage >= 1) {
    ctx.strokeStyle = 'rgba(38,77,89,0.6)'
    ctx.lineWidth = 0.03 * u
    ctx.beginPath()
    ctx.moveTo(0.02 * u, -0.7 * u)
    ctx.lineTo(-0.08 * u, -0.42 * u)
    ctx.lineTo(0.06 * u, -0.2 * u)
    ctx.lineTo(-0.04 * u, 0.02 * u)
    ctx.stroke()
  }
  if (crackStage >= 2) {
    ctx.lineWidth = 0.026 * u
    ctx.beginPath()
    ctx.moveTo(-0.08 * u, -0.42 * u)
    ctx.lineTo(-0.3 * u, -0.5 * u)
    ctx.moveTo(-0.08 * u, -0.42 * u)
    ctx.lineTo(-0.26 * u, -0.28 * u)
    ctx.moveTo(0.06 * u, -0.2 * u)
    ctx.lineTo(0.28 * u, -0.3 * u)
    ctx.moveTo(0.06 * u, -0.2 * u)
    ctx.lineTo(0.24 * u, -0.06 * u)
    ctx.moveTo(-0.04 * u, 0.02 * u)
    ctx.lineTo(-0.22 * u, 0.12 * u)
    ctx.stroke()
  }

  ctx.restore()
}

function eggPath(ctx, u) {
  ctx.beginPath()
  ctx.moveTo(0, -0.78 * u)
  ctx.bezierCurveTo(0.42 * u, -0.78 * u, 0.56 * u, -0.3 * u, 0.54 * u, 0.12 * u)
  ctx.bezierCurveTo(0.52 * u, 0.56 * u, 0.3 * u, 0.74 * u, 0, 0.74 * u)
  ctx.bezierCurveTo(-0.3 * u, 0.74 * u, -0.52 * u, 0.56 * u, -0.54 * u, 0.12 * u)
  ctx.bezierCurveTo(-0.56 * u, -0.3 * u, -0.42 * u, -0.78 * u, 0, -0.78 * u)
  ctx.closePath()
}

function dot(ctx, x, y, r) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** 敲碎时的小蛋壳碎片 */
export function makeShards(centerX, centerY, s) {
  const colors = [THEME.cream, THEME.orange, THEME.teal, THEME.butter]
  const list = []
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.5
    const sp = 0.12 + Math.random() * 0.22
    list.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 0.08,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.012,
      size: s * (0.06 + Math.random() * 0.07),
      color: colors[i % colors.length]
    })
  }
  return list
}
