import { THEME } from '../core/theme'
import { COLORS } from '../data/cats'
import { roundRectPath } from '../core/util'

/**
 * 鱼鱼蛋蛋喵立绘统一管线：灰度 PNG → 代码像素染色 → 代码叠加花纹。
 *
 * 资源：/assets/cat_base.png（代码包根目录绝对路径，透明背景，
 *       浅灰身体 / 中深灰花纹，见 assets/cat_base.png）
 *
 * 染色映射（按灰度亮度 L）：
 *   L ≥ 0.90  奶油白（脸盘 / 肚皮高光）
 *   L ≤ 0.22  暗海蓝（眼睛 / 描边，所有猫统一）
 *   其余      身体色按 0.80~1.00 的明度系数着色，
 *             原图自带灰纹被压成柔和明暗，不再是“条纹”，
 *             真正的花纹全部由代码叠加，保证六种花纹清晰可辨。
 *
 * 花纹在离屏 sprite 上以 source-atop 合成，天然被裁在猫轮廓内；
 * 花纹色取该猫 dark（比身体深一档）。
 */

const BASE_PATH = '/assets/cat_base.png'
const TEX_MAX = 520 // 染色工作图最长边（手机端控内存）

// ---- 状态 ----
let baseImg = null
let loadPromise = null
let texW = 0
let texH = 0
let tints = {} // colorKey -> 染色后的离屏 canvas
let silhouette = null
let workCanvas = null // 染色工作 canvas（createImageData 复用）
let baseFrame = null // 原始灰度帧（特殊猫现场染色用）
const spriteCache = new Map()

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const CREAM = hexRgb(THEME.cream)
const INK = hexRgb(THEME.ink)
const SIL = hexRgb(THEME.silhouette)

/** 候选路径：首选相对路径（开发者工具/真机都稳定），失败再试根目录绝对路径 */
const PATHS = ['assets/cat_base.png', BASE_PATH]

/** 启动加载（可重复调用，成功后只加载一次）；rAF 渲染会自动等图就绪 */
export function preloadCatArt() {
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve) => {
    const fail = () => {
      // 本次失败：清掉缓存，下次进场景可再试（如工具刚加入资源还没索引完）
      loadPromise = null
      resolve(false)
    }
    // 先用 getImageInfo 把代码包路径解析成可稳定 drawImage 的本地路径
    if (typeof wx.getImageInfo === 'function') {
      tryPath(0, (ok, src) => {
        if (!ok) {
          console.warn('[catArt] getImageInfo 失败，尝试直接 Image 加载')
          loadByImage(0, (good) => (good ? resolve(true) : fail()))
        } else {
          loadByImageSrc(src, (good) => (good ? resolve(true) : fail()))
        }
      })
    } else {
      loadByImage(0, (good) => (good ? resolve(true) : fail()))
    }
  })
  return loadPromise
}

/** 依次尝试候选路径做 getImageInfo */
function tryPath(i, done) {
  if (i >= PATHS.length) {
    done(false)
    return
  }
  wx.getImageInfo({
    src: PATHS[i],
    success: (res) => done(true, res.path || PATHS[i]),
    fail: () => tryPath(i + 1, done)
  })
}

function loadByImage(i, resolve) {
  if (i >= PATHS.length) {
    console.warn('[catArt] 立绘图片全部候选路径加载失败')
    resolve(false)
    return
  }
  loadByImageSrc(PATHS[i], (ok) => {
    if (ok) resolve(true)
    else loadByImage(i + 1, resolve)
  })
}

function loadByImageSrc(src, resolve) {
  let img
  try {
    img = typeof wx.createImage === 'function' ? wx.createImage() : wx.createCanvas().createImage()
  } catch (e) {
    resolve(false)
    return
  }
  img.onload = () => {
    try {
      buildTextures(img)
      baseImg = img
      resolve(true)
    } catch (e) {
      console.warn('[catArt] 像素染色失败', e)
      resolve(false)
    }
  }
  img.onerror = () => resolve(false)
  img.src = src
}

export function artReady() {
  return !!baseImg
}

// ---------------------------------------------------------------- 像素染色
function buildTextures(img) {
  const scale = Math.min(1, TEX_MAX / Math.max(img.width, img.height))
  texW = Math.max(1, Math.round(img.width * scale))
  texH = Math.max(1, Math.round(img.height * scale))

  const work = wx.createCanvas()
  work.width = texW
  work.height = texH
  const wg = work.getContext('2d')
  wg.drawImage(img, 0, 0, texW, texH)
  const frame = wg.getImageData(0, 0, texW, texH)
  workCanvas = work
  baseFrame = frame

  for (const color of COLORS) {
    tints[color.key] = tintTo(wg, frame, hexRgb(color.body))
  }
  silhouette = silhouetteFrom(wg, frame)
}

/** 现场把灰度帧染成指定单色（特殊猫用，不进预生成缓存） */
function tintBody(bodyHex) {
  if (!baseFrame || !workCanvas) return null
  return tintTo(workCanvas.getContext('2d'), baseFrame, hexRgb(bodyHex))
}

/** 把灰度帧染成指定身体色，返回新的离屏 canvas */
function tintTo(wg, frame, body) {
  const src = frame.data
  const image = wg.createImageData(texW, texH)
  const out = image.data
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    if (a === 0) continue
    const l = (src[i] + src[i + 1] + src[i + 2]) / 765 // 0..1
    let r
    let g
    let b
    if (l >= 0.9) {
      r = CREAM.r
      g = CREAM.g
      b = CREAM.b
    } else if (l <= 0.22) {
      r = INK.r
      g = INK.g
      b = INK.b
    } else {
      const f = 0.8 + 0.2 * ((l - 0.22) / 0.68)
      r = body.r * f
      g = body.g * f
      b = body.b * f
    }
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = a
  }
  return putCanvas(image)
}

/** 剪影：所有不透明像素统一填浅青灰 */
function silhouetteFrom(wg, frame) {
  const src = frame.data
  const image = wg.createImageData(texW, texH)
  const out = image.data
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    if (a < 16) continue
    out[i] = SIL.r
    out[i + 1] = SIL.g
    out[i + 2] = SIL.b
    out[i + 3] = a > 235 ? 255 : a
  }
  return putCanvas(image)
}

function putCanvas(imageData) {
  const c = wx.createCanvas()
  c.width = texW
  c.height = texH
  c.getContext('2d').putImageData(imageData, 0, 0)
  return c
}

// ---------------------------------------------------------------- sprite
function newSquareCanvas(size, dpr) {
  const c = wx.createCanvas()
  c.width = Math.round(size * dpr)
  c.height = Math.round(size * dpr)
  const g = c.getContext('2d')
  g.scale(dpr, dpr)
  g.translate(size / 2, size / 2)
  return { c, g, s: size }
}

/** contain 适配：原图竖长，按高铺满方框 */
function drawContain(g, tex, s) {
  const k = Math.min(s / texW, s / texH)
  g.drawImage(tex, (-texW * k) / 2, (-texH * k) / 2, texW * k, texH * k)
}

/**
 * 取某只猫在指定尺寸下的成品立绘（染色 + 花纹）。
 * 图未加载完时返回 null，调用方下一帧再取即可。
 */
export function getCatSprite(entry, size, dpr) {
  if (!baseImg) return null
  if (entry.colorKey && entry.colorKey.indexOf('special-') === 0) {
    return getSpecialSprite(entry, size, dpr)
  }
  const key = `${entry.colorKey}:${entry.patternKey}:${size}@${dpr}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const { c, g, s } = newSquareCanvas(size, dpr)
  drawContain(g, tints[entry.colorKey] || tints[COLORS[0].key], s)

  // 花纹双重裁剪：
  //   1) source-atop —— 只画在猫的不透明轮廓内（不溢到透明背景）
  //   2) evenodd 差集 —— 整块画布挖掉脸椭圆，花纹跳过眼/鼻/嘴
  if (entry.patternKey !== 'solid') {
    g.save()
    g.beginPath()
    g.rect(-s / 2, -s / 2, s, s)
    g.ellipse(FACE.cx * s, FACE.cy * s, FACE.rx * s, FACE.ry * s, 0, 0, Math.PI * 2)
    g.clip('evenodd')
    g.globalCompositeOperation = 'source-atop'
    paintPattern(g, s, entry.patternKey, entry.dark)
    g.restore()
  }

  spriteCache.set(key, c)
  return c
}

// ---------------------------------------------------------------- 特殊猫
/**
 * 特殊猫立绘：基于灰度 base 染色 + 专属视觉效果 + 饰品。
 *   太阳喵：纯白身体 + 金色放射光晕 + 铃铛
 *   星空喵：深蓝身体 + 紫色星光花纹 + 蝴蝶结
 *   嘤嘤喵：彩虹渐变身体 + 荧光 + 小鞋子
 */
function getSpecialSprite(entry, size, dpr) {
  const key = `${entry.colorKey}:${size}@${dpr}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const { c, g, s } = newSquareCanvas(size, dpr)

  // 荧光先画在最底层：身体会遮住中间，只露出轮廓外的一圈柔光，
  // 绝不盖到脸（原来画在身体上层导致脸部发灰不清晰）
  paintFluorescence(g, s, entry.colorKey)

  // 身体
  if (entry.colorKey === 'special-rainbow') {
    // 先染粉色底，再用 source-atop 叠水平彩虹渐变覆盖身体
    drawContain(g, tintBody(entry.body), s)
    const grad = g.createLinearGradient(-s / 2, 0, s / 2, 0)
    grad.addColorStop(0, '#f8b9d1')
    grad.addColorStop(0.18, '#f9c18e')
    grad.addColorStop(0.36, '#f8df8e')
    grad.addColorStop(0.54, '#9cd8b0')
    grad.addColorStop(0.72, '#93cce9')
    grad.addColorStop(1, '#cbb8ec')
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = grad
    g.fillRect(-s / 2, -s / 2, s, s)
    g.globalCompositeOperation = 'source-over'
  } else {
    drawContain(g, tintBody(entry.body), s)
  }

  // 专属效果（裁剪到猫轮廓内，跳过脸部，绝不盖五官）
  g.save()
  g.beginPath()
  g.rect(-s / 2, -s / 2, s, s)
  g.ellipse(FACE.cx * s, FACE.cy * s, FACE.rx * s, FACE.ry * s, 0, 0, Math.PI * 2)
  g.clip('evenodd')
  g.globalCompositeOperation = 'source-atop'
  if (entry.colorKey === 'special-sun') paintSunGlow(g, s)
  else if (entry.colorKey === 'special-star') paintStarField(g, s, entry.dark)
  else if (entry.colorKey === 'special-rainbow') paintRainbowSparkle(g, s)
  g.restore()

  // 饰品（脖子/耳朵/围巾，避开脸部）
  if (entry.accessory === 'bell') drawBell(g, s)
  else if (entry.accessory === 'bow') drawBow(g, s)
  else if (entry.accessory === 'scarf') drawScarf(g, s)

  spriteCache.set(key, c)
  return c
}

/** 太阳喵：身体上叠一层金色径向辉光，模拟“揣着光” */
function paintSunGlow(g, s) {
  const cx = 0
  const cy = 0.12 * s
  const r = 0.42 * s
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r)
  grad.addColorStop(0, 'rgba(240,207,110,0.55)')
  grad.addColorStop(0.5, 'rgba(240,207,110,0.25)')
  grad.addColorStop(1, 'rgba(240,207,110,0)')
  g.fillStyle = grad
  g.fillRect(-s / 2, -s / 2, s, s)
  // 几道短放射光线
  g.strokeStyle = 'rgba(240,207,110,0.5)'
  g.lineWidth = 0.018 * s
  g.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const r1 = 0.18 * s
    const r2 = 0.3 * s
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
    g.stroke()
  }
}

/** 星空喵：躯干上散布四角星点 */
function paintStarField(g, s, dark) {
  g.fillStyle = dark
  const pts = [
    [-0.18, 0.05, 0.045],
    [0.12, -0.02, 0.04],
    [-0.04, 0.18, 0.05],
    [0.2, 0.16, 0.038],
    [-0.22, 0.28, 0.042],
    [0.05, 0.34, 0.04],
    [0.24, 0.3, 0.035],
    [-0.1, 0.4, 0.038]
  ]
  for (const [px, py, r] of pts) {
    drawFourPointStar(g, px * s, py * s, r * s)
  }
}

function drawFourPointStar(g, x, y, r) {
  g.beginPath()
  g.moveTo(x, y - r)
  g.quadraticCurveTo(x, y, x + r, y)
  g.quadraticCurveTo(x, y, x, y + r)
  g.quadraticCurveTo(x, y, x - r, y)
  g.quadraticCurveTo(x, y, x, y - r)
  g.fill()
}

/** 嘤嘤喵：彩虹身体上再叠白色小亮片 */
function paintRainbowSparkle(g, s) {
  g.fillStyle = 'rgba(255,255,255,0.7)'
  for (let i = 0; i < 10; i++) {
    const x = (-0.25 + Math.random() * 0.5) * s
    const y = (-0.05 + Math.random() * 0.5) * s
    const r = 0.012 * s + Math.random() * 0.018 * s
    drawFourPointStar(g, x, y, r)
  }
}

/** 荧光外发光：猫轮廓外一圈柔光（多层半透明放大轮廓） */
function paintFluorescence(g, s, colorKey) {
  let color = 'rgba(240,207,110,0.5)'
  if (colorKey === 'special-star') color = 'rgba(181,156,240,0.55)'
  else if (colorKey === 'special-rainbow') color = 'rgba(248,185,209,0.6)'
  // 用 silhouette 放大后低透明度叠在底层（剪影已含身体轮廓）
  g.save()
  g.globalAlpha = 0.35
  g.fillStyle = color
  g.globalCompositeOperation = 'source-over'
  // 直接在猫轮廓外画几个半透明大圆模拟光晕，不依赖 silhouette 引用
  for (const [ox, oy, r] of [
    [-0.05 * s, 0.05 * s, 0.34 * s],
    [0.05 * s, 0.18 * s, 0.3 * s],
    [0, -0.15 * s, 0.22 * s]
  ]) {
    g.beginPath()
    g.arc(ox, oy, r, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

/** 太阳喵饰品：脖子上的小铃铛 */
function drawBell(g, s) {
  const cx = 0
  const cy = 0.02 * s
  // 红色项圈
  g.strokeStyle = '#d46c4e'
  g.lineWidth = 0.05 * s
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(-0.16 * s, cy)
  g.lineTo(0.16 * s, cy)
  g.stroke()
  // 铃铛本体
  g.fillStyle = '#f0cf6e'
  g.strokeStyle = '#d8ab3f'
  g.lineWidth = 1
  g.beginPath()
  g.arc(cx, cy + 0.03 * s, 0.05 * s, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  // 铃口黑线
  g.strokeStyle = '#264D59'
  g.lineWidth = 0.018 * s
  g.beginPath()
  g.moveTo(cx - 0.025 * s, cy + 0.05 * s)
  g.lineTo(cx + 0.025 * s, cy + 0.05 * s)
  g.stroke()
}

/** 星空喵饰品：左耳粉色蝴蝶结 */
function drawBow(g, s) {
  const bx = -0.14 * s
  const by = -0.38 * s
  g.fillStyle = '#f8b9d1'
  g.strokeStyle = '#e893b5'
  g.lineWidth = 1
  // 左叶
  g.beginPath()
  g.ellipse(bx - 0.045 * s, by, 0.045 * s, 0.03 * s, -0.4, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  // 右叶
  g.beginPath()
  g.ellipse(bx + 0.045 * s, by, 0.045 * s, 0.03 * s, 0.4, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  // 中心结
  g.fillStyle = '#e893b5'
  g.beginPath()
  g.arc(bx, by, 0.018 * s, 0, Math.PI * 2)
  g.fill()
}

/** 嘤嘤喵饰品：脖子上的彩虹围巾（绕颈横条 + 中间结 + 两端垂布） */
function drawScarf(g, s) {
  const cx = 0
  const cy = 0.02 * s
  // 彩虹渐变（与身体彩虹同色系）
  const grad = g.createLinearGradient(-0.16 * s, 0, 0.16 * s, 0)
  grad.addColorStop(0, '#f8b9d1')
  grad.addColorStop(0.2, '#f9c18e')
  grad.addColorStop(0.4, '#f8df8e')
  grad.addColorStop(0.6, '#9cd8b0')
  grad.addColorStop(0.8, '#93cce9')
  grad.addColorStop(1, '#cbb8ec')

  // 绕颈横条
  g.fillStyle = grad
  g.strokeStyle = 'rgba(38,77,89,0.25)'
  g.lineWidth = 1
  roundRectPath(g, cx - 0.17 * s, cy - 0.03 * s, 0.34 * s, 0.06 * s, 0.03 * s)
  g.fill()
  g.stroke()

  // 中间结（小菱形）
  g.beginPath()
  g.moveTo(cx, cy + 0.04 * s)
  g.lineTo(cx + 0.04 * s, cy)
  g.lineTo(cx, cy - 0.04 * s)
  g.lineTo(cx - 0.04 * s, cy)
  g.closePath()
  g.fillStyle = grad
  g.fill()
  g.stroke()

  // 左端垂布
  g.beginPath()
  g.moveTo(cx - 0.1 * s, cy + 0.03 * s)
  g.lineTo(cx - 0.13 * s, cy + 0.14 * s)
  g.lineTo(cx - 0.05 * s, cy + 0.14 * s)
  g.lineTo(cx - 0.06 * s, cy + 0.03 * s)
  g.closePath()
  g.fillStyle = grad
  g.fill()
  g.stroke()

  // 右端垂布（略短，错落）
  g.beginPath()
  g.moveTo(cx + 0.06 * s, cy + 0.03 * s)
  g.lineTo(cx + 0.05 * s, cy + 0.12 * s)
  g.lineTo(cx + 0.13 * s, cy + 0.12 * s)
  g.lineTo(cx + 0.1 * s, cy + 0.03 * s)
  g.closePath()
  g.fillStyle = grad
  g.fill()
  g.stroke()
}

// ---------------------------------------------------------------- sprite
/**
 * 脸部保护区（画布中心为原点，s 为方框边长；纹理按高 contain，
 * 即 1.0s = 原图全高）。眼睛约在原图 0.32 高（y≈-0.18s）、
 * 嘴约在 0.44 高（y≈-0.06s），椭圆把眼/鼻/嘴完整包住。
 */
const FACE = { cx: 0, cy: -0.12, rx: 0.27, ry: 0.23 }

/** 未解锁剪影（含暗海蓝小挂锁） */
export function getLockedSprite(size, dpr) {
  if (!baseImg) return null
  const key = `locked:${size}@${dpr}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const { c, g, s } = newSquareCanvas(size, dpr)
  drawContain(g, silhouette, s)
  drawPadlock(g, s)
  spriteCache.set(key, c)
  return c
}

/** 图未就绪时的柔和占位，避免卡片闪烁空白 */
export function drawCatPlaceholder(ctx, s) {
  ctx.save()
  ctx.fillStyle = THEME.silhouette
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.ellipse(0, s * 0.04, s * 0.26, s * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------- 花纹
/**
 * 坐标系：画布中心为 (0,0)，s 为方框边长。
 * 头在上（耳尖约 -0.45s，眼睛约 -0.18s），身体在 -0.02s ~ +0.46s。
 */
function paintPattern(g, s, type, dark) {
  if (type === 'dots') paintDots(g, s, dark)
  else if (type === 'stripes') paintStripes(g, s, dark)
  else if (type === 'waves') paintWaves(g, s, dark)
  else if (type === 'stars') paintStars(g, s, dark)
  else if (type === 'clouds') paintClouds(g, s, dark)
  // solid：不叠加任何花纹
}

function paintDots(g, s, dark) {
  const cx = 0
  const cy = 0.13 * s
  const rx = 0.27 * s
  const ry = 0.3 * s
  const rad = 0.03 * s
  const dxp = 0.1 * s
  const dyp = 0.085 * s
  g.fillStyle = dark
  g.globalAlpha = 0.9
  let row = 0
  for (let y = -0.02 * s; y <= 0.4 * s; y += dyp, row++) {
    const off = row % 2 ? dxp / 2 : 0
    for (let x = -0.3 * s; x <= 0.3 * s; x += dxp) {
      const px = x + off
      const nx = (px - cx) / rx
      const ny = (y - cy) / ry
      if (nx * nx + ny * ny <= 1) {
        g.beginPath()
        g.arc(px, y, rad, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  g.globalAlpha = 1
}

function paintStripes(g, s, dark) {
  g.strokeStyle = dark
  g.fillStyle = dark
  g.globalAlpha = 0.85
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // 额头三道竖纹（双耳之间、脸部保护区上方）
  g.lineWidth = 0.045 * s
  for (const fx of [-0.07, 0, 0.07]) {
    g.beginPath()
    g.moveTo(fx * s, -0.485 * s)
    g.quadraticCurveTo((fx + 0.008) * s, -0.43 * s, fx * s, -0.375 * s)
    g.stroke()
  }
  // 两颊属于脸部保护区，不画条纹（眼/鼻/嘴不被遮挡）

  // 背部三道弧纹
  g.lineWidth = 0.04 * s
  for (let k = 0; k < 3; k++) {
    const r = (0.26 + k * 0.09) * s
    g.beginPath()
    g.arc(0, 0.66 * s, r, Math.PI * 1.06, Math.PI * 1.94)
    g.stroke()
  }
  g.globalAlpha = 1
}

function paintWaves(g, s, dark) {
  g.strokeStyle = dark
  g.globalAlpha = 0.85
  g.lineWidth = 0.036 * s
  g.lineCap = 'round'
  const amp = 0.022 * s
  const wl = 0.17 * s
  for (const yy of [0.04, 0.17, 0.3]) {
    g.beginPath()
    for (let x = -0.27; x <= 0.271; x += 0.02) {
      const wx = x * s
      const wy = yy * s + Math.sin((x * s) / wl * Math.PI * 2) * amp
      if (x === -0.27) g.moveTo(wx, wy)
      else g.lineTo(wx, wy)
    }
    g.stroke()
  }
  g.globalAlpha = 1
}

/** 星纹：固定排布的四角闪光星，落在躯干两侧，脸部由裁剪区保护 */
function paintStars(g, s, dark) {
  g.fillStyle = dark
  g.globalAlpha = 0.9
  // [x, y, r] 相对 s 的单位坐标
  const stars = [
    [-0.15, 0.07, 0.052],
    [0.14, 0.13, 0.045],
    [0, 0.2, 0.056],
    [-0.13, 0.29, 0.04],
    [0.16, 0.33, 0.05],
    [0.02, 0.4, 0.038]
  ]
  for (const [ux, uy, ur] of stars) {
    sparklePath(g, ux * s, uy * s, ur * s)
    g.fill()
  }
  g.globalAlpha = 1
}

/** 四角星（曲线菱形）路径 */
function sparklePath(g, cx, cy, r) {
  g.beginPath()
  g.moveTo(cx, cy - r)
  g.quadraticCurveTo(cx, cy, cx + r, cy)
  g.quadraticCurveTo(cx, cy, cx, cy + r)
  g.quadraticCurveTo(cx, cy, cx - r, cy)
  g.quadraticCurveTo(cx, cy, cx, cy - r)
  g.closePath()
}

/** 云团：两朵由圆弧拼出的蓬松云，贴在躯干两侧 */
function paintClouds(g, s, dark) {
  g.fillStyle = dark
  g.globalAlpha = 0.82
  // 每朵云：[中心 x, 中心 y, 主半径]
  const clouds = [
    [-0.14, 0.15, 0.068],
    [0.15, 0.32, 0.062]
  ]
  for (const [ux, uy, ur] of clouds) {
    const cx = ux * s
    const cy = uy * s
    const r = ur * s
    // 圆簇拼出蓬松软云
    const puffs = [
      [0, 0, 1],
      [0.95, 0.12, 0.78],
      [-0.95, 0.14, 0.72],
      [0.1, -0.62, 0.72],
      [-0.55, -0.4, 0.6]
    ]
    for (const [px, py, pr] of puffs) {
      g.beginPath()
      g.arc(cx + px * r, cy + py * r, r * pr, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.globalAlpha = 1
}

function drawPadlock(g, s) {
  const w = 0.16 * s
  const h = 0.13 * s
  const x = -w / 2
  const y = 0.02 * s
  g.save()
  // 锁梁
  g.strokeStyle = THEME.ink
  g.lineWidth = 0.026 * s
  g.lineCap = 'round'
  g.beginPath()
  g.arc(0, y, w * 0.32, Math.PI, 0)
  g.stroke()
  // 锁体
  g.fillStyle = THEME.ink
  g.beginPath()
  const rr = 0.03 * s
  g.moveTo(x + rr, y)
  g.arcTo(x + w, y, x + w, y + h, rr)
  g.arcTo(x + w, y + h, x, y + h, rr)
  g.arcTo(x, y + h, x, y, rr)
  g.arcTo(x, y, x + w, y, rr)
  g.closePath()
  g.fill()
  // 钥匙孔
  g.fillStyle = THEME.cream
  g.beginPath()
  g.arc(0, y + h * 0.42, 0.016 * s, 0, Math.PI * 2)
  g.fill()
  g.restore()
}
