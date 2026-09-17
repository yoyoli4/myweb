export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export const lerp = (a, b, t) => a + (b - a) * t

export const rand = (a, b) => a + Math.random() * (b - a)

/** 圆角矩形路径（不填充不描边，由调用方决定 fill/stroke） */
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
