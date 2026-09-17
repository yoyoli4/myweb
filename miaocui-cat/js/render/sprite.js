/**
 * 离屏画布缓存：静态立绘只绘制一次，帧循环里只做 drawImage。
 * 注意：游戏中第一次 wx.createCanvas() 返回主画布（已在 game.js 调用），
 * 之后再调用返回的就是离屏 canvas。
 *
 * painter(ctx, size) 以画布中心为原点绘制。
 */
export function makeSprite(size, dpr, painter) {
  const c = wx.createCanvas()
  c.width = Math.round(size * dpr)
  c.height = Math.round(size * dpr)

  const g = c.getContext('2d')
  g.scale(dpr, dpr)
  g.translate(size / 2, size / 2)
  painter(g, size)
  return c
}
