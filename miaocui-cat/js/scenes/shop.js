import CodexScene from './codex'
import CoverScene from './cover'
import ExploreScene from './explore'
import {
  SPECIAL_CATS,
  getEvolutionPoints,
  ownsSpecialCat,
  buySpecialCat,
  setActiveCatId,
  getActiveCatId
} from '../data/cats'
import { preloadCatArt, getCatSprite, drawCatPlaceholder } from '../render/catArt'
import { THEME } from '../core/theme'
import { sfx } from '../core/audio'
import { clamp, roundRectPath } from '../core/util'

/**
 * 特殊猫商店：3 只特殊猫纵向陈列。
 *   已拥有 → 显示“已拥有”，可设为主控
 *   未拥有 → 显示价格 / 购买按钮；点数不足显示“还差 X 点”
 */
export default class ShopScene {
  constructor(view, from) {
    this.view = view
    this.from = from || 'cover' // 'cover' | 'codex'
    this.time = 0
    this.toast = { text: '', t: 9999 }

    const { w, h, safeTop, bottomInset } = view
    const headH = Math.max(28, view.menu.height)
    this.backBtn = { x: 12, y: view.menu.top, w: 64, h: headH }

    // 三张卡片纵向布局
    const pad = 18
    const cardTop = safeTop + 68
    const cardBottom = h - Math.max(bottomInset, 12) - 12
    const cardH = (cardBottom - cardTop - 12 * 2) / 3
    this.cards = SPECIAL_CATS.map((entry, i) => ({
      entry,
      x: pad,
      y: cardTop + i * (cardH + 12),
      w: w - pad * 2,
      h: cardH
    }))

    preloadCatArt()
  }

  _rows() {
    return this.cards
  }

  /** 卡片右下角按钮热区（介绍移到中部，按钮沉底，给文字留足宽度） */
  _btnRect(card) {
    const bw = 104
    const bh = 36
    return {
      x: card.x + card.w - 16 - bw,
      y: card.y + card.h - 16 - bh,
      w: bw,
      h: bh
    }
  }

  update(dt) {
    this.time += dt
    if (this.toast.t < 9999) this.toast.t += dt
  }

  onTouchStart(x, y) {
    const b = this.backBtn
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      this._goBack()
      return
    }
    const points = getEvolutionPoints()
    for (const card of this.cards) {
      const btn = this._btnRect(card)
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        const owned = ownsSpecialCat(card.entry.id)
        if (owned) {
          setActiveCatId(card.entry.id)
          sfx.select && sfx.select()
          this.toast = { text: `已设为主控：${card.entry.name}`, t: 0 }
          return
        }
        const price = card.entry.price
        if (points < price) {
          this.toast = { text: `还差 ${price - points} 点进化点数`, t: 0 }
          return
        }
        const res = buySpecialCat(card.entry.id)
        if (res.ok) {
          sfx.levelUp && sfx.levelUp()
          if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
          this.toast = { text: `获得 ${card.entry.name}！`, t: 0 }
        }
        return
      }
    }
  }
  onTouchMove() {}
  onTouchEnd() {}

  _goBack() {
    if (this.from === 'codex') {
      this.director.runScene(new CodexScene(this.view))
    } else if (this.from === 'explore') {
      this.director.runScene(new ExploreScene(this.view))
    } else {
      this.director.runScene(new CoverScene(this.view))
    }
  }

  render(ctx) {
    const { w, h, menu } = this.view
    ctx.fillStyle = THEME.cream
    ctx.fillRect(0, 0, w, h)

    // 标题 + 返回
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 19px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('特殊猫商店', w / 2, menu.top + 22)

    ctx.fillStyle = THEME.teal
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('← 返回', this.backBtn.x + 4, menu.top + 22)

    // 进化点余额（标题下方居中，鎏金胶囊，与探索 HUD 同款）
    this._drawPoints(ctx)

    // 三张卡片
    for (const card of this.cards) this._drawCard(ctx, card)

    // 提示 toast
    if (this.toast.t < 2200) {
      const txt = this.toast.text
      ctx.font = 'bold 14px sans-serif'
      const tw = Math.ceil(ctx.measureText(txt).width) + 32
      const tx = (w - tw) / 2
      const ty = this.view.safeTop + 44
      roundRectPath(ctx, tx, ty, tw, 30, 15)
      ctx.fillStyle = 'rgba(38,77,89,0.9)'
      ctx.fill()
      ctx.fillStyle = THEME.cream
      ctx.textAlign = 'center'
      ctx.fillText(txt, w / 2, ty + 20)
    }

    // 商店角标：右下角（看不到 V2 = 旧缓存）
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(38,77,89,0.4)'
    ctx.fillText('V2', this.view.w - 8, this.view.h - 6)
  }

  _drawPoints(ctx) {
    const pts = getEvolutionPoints()
    const label = `进化点 ${pts}`
    const { w, menu } = this.view
    ctx.font = 'bold 12px sans-serif'
    const tw = Math.ceil(ctx.measureText(label).width)
    const bw = tw + 40
    const bh = 24
    const bx = (w - bw) / 2
    const by = menu.top + menu.height + 8
    roundRectPath(ctx, bx, by, bw, bh, bh / 2)
    ctx.fillStyle = 'rgba(255,248,231,0.95)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,171,63,0.85)'
    ctx.lineWidth = 1.2
    ctx.stroke()
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

  _drawCard(ctx, card) {
    const { entry } = card
    const owned = ownsSpecialCat(entry.id)
    const points = getEvolutionPoints()
    const active = getActiveCatId() === entry.id

    // 卡片底
    roundRectPath(ctx, card.x, card.y, card.w, card.h, 18)
    ctx.fillStyle = THEME.creamDim
    ctx.fill()
    ctx.strokeStyle = 'rgba(67,151,141,0.35)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // 立绘（左侧，略缩小给介绍让宽度）
    const imgSize = Math.min(card.h - 32, 104)
    const ix = card.x + 20
    const iy = card.y + (card.h - imgSize) / 2
    const spr = getCatSprite(entry, imgSize, this.view.dpr)
    ctx.save()
    ctx.translate(ix + imgSize / 2, iy + imgSize / 2)
    if (spr) ctx.drawImage(spr, -imgSize / 2, -imgSize / 2, imgSize, imgSize)
    else drawCatPlaceholder(ctx, imgSize)
    ctx.restore()

    // 名称（右上）
    const tx = card.x + 20 + imgSize + 16
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(entry.name, tx, card.y + 30)

    // 介绍（名称下方，占满右侧宽度，最多3行）
    const tw = card.w - (20 + imgSize + 16) - 16
    ctx.fillStyle = THEME.inkSoft
    ctx.font = '12px sans-serif'
    const intro = entry.intro || ''
    const lines = wrapText(ctx, intro, tw)
    const introY = card.y + 52
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      ctx.fillText(lines[i], tx, introY + i * 18)
    }

    // 右侧按钮
    const btn = this._btnRect(card)
    roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 19)
    let fill, stroke, txt, txtColor = THEME.cream
    if (owned) {
      if (active) {
        fill = 'rgba(67,151,141,0.2)'
        stroke = 'rgba(67,151,141,0.5)'
        txt = '当前主控'
        txtColor = THEME.teal
      } else {
        fill = THEME.teal
        stroke = 'rgba(38,77,89,0.3)'
        txt = '设为主控'
      }
    } else if (points < entry.price) {
      fill = 'rgba(212,108,78,0.28)'
      stroke = 'rgba(212,108,78,0.4)'
      txt = `还差 ${entry.price - points} 点`
      txtColor = THEME.brick
    } else {
      fill = THEME.orange
      stroke = 'rgba(212,108,78,0.55)'
      txt = `购买 · ${entry.price}点`
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
    ctx.fillText(txt, btn.x + btn.w / 2, btn.y + btn.h / 2 + 0.5)
    ctx.textBaseline = 'alphabetic'
  }
}

/** 简单按宽度折行（中文按字符断） */
function wrapText(ctx, text, maxW) {
  const lines = []
  let cur = ''
  for (const ch of text) {
    const test = cur + ch
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur)
      cur = ch
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}
