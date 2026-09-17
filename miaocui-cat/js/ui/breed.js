import {
  getOwned,
  getRosterEntry,
  breedChild,
  consumeEgg,
  addCatInstance,
  decomposeDuplicate
} from '../data/cats'
import { preloadCatArt, getCatSprite, drawCatPlaceholder } from '../render/catArt'
import { evaluateAchievements } from '../data/achievements'
import { sfx } from '../core/audio'
import { drawEgg, makeShards } from '../entities/egg'
import { THEME } from '../core/theme'
import { clamp, roundRectPath } from '../core/util'

const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ']

/**
 * 孵化流程弹层（覆盖在探索区上）：
 *   egg   空蛋，点蛋进入选父母
 *   pick  已收集猫列表，先点父、再点母，确认
 *   hatch 蛋晃动 → 两道裂缝 → 提示点击 → 敲碎
 *   result 新猫弹出，自动进图鉴
 * 全部即时，无倒计时。
 */
export default class BreedFlow {
  constructor(view) {
    this.view = view
    this.active = false
    this.state = ''
    this.onClose = null

    this.eggUid = null
    this.sel = [null, null]
    this.time = 0
    this.hatchT = 0
    this.shatterT = -1
    this.resultT = 0
    this.child = null
    this.shards = []
    this.decomposePoints = 0 // 本次孵化若分解，关弹层时带给探索区弹提示

    preloadCatArt()
    this._buildPanel()
  }

  open(eggUid) {
    this.active = true
    this.state = 'egg'
    this.eggUid = eggUid
    this.sel = [null, null]
    this.time = 0
    this.hatchT = 0
    this.shatterT = -1
    this.resultT = 0
    this.child = null
    this.shards = []
    this.decomposePoints = 0
  }

  close() {
    this.active = false
    if (this.onClose) {
      // 仅本次孵化发生了重复分解时，通知探索区弹“获得 X 点进化点数”
      this.onClose(this.decomposePoints > 0 ? { decomposePoints: this.decomposePoints } : null)
    }
  }

  _buildPanel() {
    const { w, h, safeTop, bottomInset } = this.view
    this.panel = {
      x: 24,
      y: safeTop + 12, // 整体在系统胶囊安全线以下
      w: w - 48,
      h: h - safeTop - 12 - Math.max(bottomInset, 12) - 12
    }
    // 关闭键放左上角（右上角留给系统胶囊，不放任何可点元素）
    this.closeRect = { x: this.panel.x + 10, y: this.panel.y + 10, w: 28, h: 28 }
  }

  // ----------------------------------------------------------------
  update(dt) {
    if (!this.active) return
    this.time += dt

    if (this.state === 'hatch') {
      if (this.shatterT < 0) this.hatchT += dt
      if (this.shatterT >= 0) {
        this.shatterT += dt
        for (const s of this.shards) {
          s.x += s.vx * dt
          s.y += s.vy * dt
          s.vy += 0.0011 * dt
          s.rot += s.vr * dt
        }
        if (this.shatterT >= 360 && this.state === 'hatch') {
          const { entry, gen, isNew, colorMutated, patternMutated } = this._bred
          // 图鉴已有同色同花纹 → 重复猫不入库，自动分解为进化点数
          let inst = null
          let duplicate = false
          let points = 0
          if (isNew) {
            inst = addCatInstance(entry.id, gen)
          } else {
            duplicate = true
            points = decomposeDuplicate(entry.id)
            this.decomposePoints = points
          }
          evaluateAchievements() // 集色 / 代数 / 稀有花纹颜色 / 双稀有（重复不影响判定，保持原有调用）
          this.child = {
            entry,
            gen,
            isNew,
            inst,
            colorMutated,
            patternMutated,
            duplicate,
            points
          }
          this.resultT = 0
          this.state = 'result'
          sfx.born() // 低音奶声喵
          if (entry.colorRarity === 'rare' || entry.patternTier === 'rare') {
            setTimeout(() => sfx.rare(), 480) // 稀有猫特殊音调，错开出生喵
          }
        }
      }
    } else if (this.state === 'result') {
      this.resultT += dt
    }
  }

  // ----------------------------------------------------------------
  onTouchStart(x, y) {
    if (!this.active) return false
    const c = this.closeRect
    const inClose = x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.w

    if (inClose && this.state !== 'hatch') {
      this.close()
      return true
    }

    if (this.state === 'egg') this._touchEgg(x, y)
    else if (this.state === 'pick') this._touchPick(x, y)
    else if (this.state === 'hatch') this._touchHatch(x, y)
    else if (this.state === 'result') this._touchResult(x, y)
    return true
  }

  onTouchMove() {}

  onTouchEnd() {}

  _touchEgg(x, y) {
    const e = this._eggRect()
    if (Math.hypot(x - e.x, y - e.y) <= e.r + 12) {
      if (getOwned().length < 2) return
      this.state = 'pick'
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
    }
  }

  _touchPick(x, y) {
    // 确认按钮
    const ok = this._confirmRect()
    if (this.sel[0] && this.sel[1] && x >= ok.x && x <= ok.x + ok.w && y >= ok.y && y <= ok.y + ok.h) {
      this._startHatch()
      return
    }

    const owned = getOwned()
    const cells = this._pickCells(owned)
    for (const cell of cells) {
      if (x >= cell.x && x <= cell.x + cell.w && y >= cell.y && y <= cell.y + cell.h) {
        const uid = cell.inst.uid
        if (this.sel[0] === uid) {
          this.sel[0] = null
        } else if (this.sel[1] === uid) {
          this.sel[1] = null
        } else if (!this.sel[0]) {
          this.sel[0] = uid
        } else if (!this.sel[1]) {
          this.sel[1] = uid
        } else {
          // 父母已满又点了新猫：从头选，新点的当父
          this.sel = [uid, null]
        }
        if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
        return
      }
    }
  }

  _touchHatch(x, y) {
    if (this.shatterT >= 0) return
    if (this.hatchT < 1000) return // 裂缝动画播完才能敲
    const e = this._eggRect()
    if (Math.hypot(x - e.x, y - e.y) <= e.r + 26) {
      this.shatterT = 0
      this.shards = makeShards(e.x, e.y, e.r * 2)
      sfx.crack() // 蛋壳脆裂声
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'medium' })
    }
  }

  _touchResult(x, y) {
    const b = this._doneRect()
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) this.close()
  }

  _startHatch() {
    const owned = getOwned()
    const father = owned.find((o) => o.uid === this.sel[0])
    const mother = owned.find((o) => o.uid === this.sel[1])
    if (!father || !mother) return

    this._bred = breedChild(father, mother)
    consumeEgg(this.eggUid)
    this.state = 'hatch'
    this.hatchT = 0
    sfx.hatch() // 孵化过程音（温暖上行琶音）
  }

  // ----------------------------------------------------------------
  render(ctx) {
    if (!this.active) return

    // 遮罩
    ctx.fillStyle = 'rgba(38,77,89,0.45)'
    ctx.fillRect(0, 0, this.view.w, this.view.h)

    const p = this.panel
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 22)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = THEME.seaLine
    ctx.lineWidth = 1.5
    ctx.stroke()

    if (this.state === 'egg') this._renderEgg(ctx)
    else if (this.state === 'pick') this._renderPick(ctx)
    else if (this.state === 'hatch') this._renderHatch(ctx)
    else if (this.state === 'result') this._renderResult(ctx)
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

  _drawTitle(ctx, text) {
    const p = this.panel
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 19px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text, p.x + p.w / 2, p.y + 38)
  }

  _eggRect() {
    const p = this.panel
    return { x: p.x + p.w / 2, y: p.y + p.h * 0.42, r: Math.min(p.w * 0.3, 74) }
  }

  // ---- 空蛋 ----
  _renderEgg(ctx) {
    this._drawTitle(ctx, '孵化槽')
    this._drawClose(ctx)

    const owned = getOwned()
    const e = this._eggRect()
    const bob = Math.sin(this.time * 0.003) * 4

    ctx.save()
    ctx.translate(e.x, e.y + bob)
    drawEgg(ctx, e.r * 2, 0)
    ctx.restore()

    const p = this.panel
    ctx.textAlign = 'center'
    if (owned.length >= 2) {
      ctx.fillStyle = THEME.ink
      ctx.font = '15px sans-serif'
      ctx.fillText('点一下空蛋，选两位家长', p.x + p.w / 2, e.y + e.r + 44)
      ctx.fillStyle = THEME.inkSoft
      ctx.font = '12px sans-serif'
      ctx.fillText('颜色花纹各判各的 · 5%/8% 概率变异', p.x + p.w / 2, e.y + e.r + 68)
    } else {
      ctx.fillStyle = THEME.brick
      ctx.font = '14px sans-serif'
      ctx.fillText('至少收录 2 只猫才能配种', p.x + p.w / 2, e.y + e.r + 44)
    }
  }

  // ---- 选父母 ----
  _pickCells(owned) {
    const p = this.panel
    const cols = 3
    const rows = Math.max(1, Math.ceil(owned.length / cols))
    const top = p.y + 78
    const bottom = p.y + p.h - 86
    const gap = 10
    const cellW = (p.w - 40 - gap * (cols - 1)) / cols
    const cellH = Math.min(cellW * 1.16, (bottom - top - gap * (rows - 1)) / rows)
    const gridH = cellH * rows + gap * (rows - 1)
    const startY = top + Math.max(0, (bottom - top - gridH) / 2)

    return owned.map((inst, i) => {
      const r = (i / cols) | 0
      const c = i % cols
      return {
        inst,
        x: p.x + 20 + c * (cellW + gap),
        y: startY + r * (cellH + gap),
        w: cellW,
        h: cellH
      }
    })
  }

  _renderPick(ctx) {
    this._drawTitle(ctx, '先点父，再点母')
    this._drawClose(ctx)

    const owned = getOwned()
    const cells = this._pickCells(owned)

    cells.forEach((cell) => {
      const slot = this.sel[0] === cell.inst.uid ? 0 : this.sel[1] === cell.inst.uid ? 1 : -1
      const ring = slot === 0 ? THEME.butter : slot === 1 ? THEME.teal : null

      roundRectPath(ctx, cell.x, cell.y, cell.w, cell.h, 14)
      ctx.fillStyle = slot >= 0 ? 'rgba(249,224,127,0.18)' : THEME.creamDim
      ctx.fill()
      ctx.strokeStyle = ring || THEME.lockStroke
      ctx.lineWidth = slot >= 0 ? 2.5 : 1.2
      ctx.stroke()

      const imgSize = cell.w * 0.62
      const img = getCatSprite(getRosterEntry(cell.inst.id), Math.round(imgSize), this.view.dpr)
      const imgX = cell.x + (cell.w - imgSize) / 2
      const imgY = cell.y + 6
      if (img) {
        ctx.drawImage(img, imgX, imgY, imgSize, imgSize)
      } else {
        ctx.save()
        ctx.translate(imgX + imgSize / 2, imgY + imgSize / 2)
        drawCatPlaceholder(ctx, imgSize)
        ctx.restore()
      }

      const entry = getRosterEntry(cell.inst.id)
      ctx.textAlign = 'center'
      ctx.fillStyle = THEME.ink
      ctx.font = `${Math.max(10, Math.round(cell.w * 0.12))}px sans-serif`
      const name = entry.name.length > 6 ? entry.name.slice(0, 6) : entry.name
      ctx.fillText(name, cell.x + cell.w / 2, cell.y + cell.h - 22)

      // 代数小标
      ctx.fillStyle = THEME.inkSoft
      ctx.font = '10px sans-serif'
      ctx.fillText(`${ROMAN[cell.inst.gen] || cell.inst.gen}代`, cell.x + cell.w / 2, cell.y + cell.h - 8)

      // 父 / 母 角标
      if (slot >= 0) {
        const chipW = 22
        const chipH = 18
        const cx = cell.x + cell.w - chipW - 5
        const cy = cell.y + 5
        roundRectPath(ctx, cx, cy, chipW, chipH, 9)
        ctx.fillStyle = slot === 0 ? THEME.orange : THEME.teal
        ctx.fill()
        ctx.fillStyle = THEME.cream
        ctx.font = 'bold 11px sans-serif'
        ctx.fillText(slot === 0 ? '父' : '母', cx + chipW / 2, cy + 13)
      }
    })

    // 确认按钮
    const b = this._confirmRect()
    const ready = !!(this.sel[0] && this.sel[1])
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 20)
    ctx.fillStyle = ready ? THEME.orange : 'rgba(249,173,106,0.4)'
    ctx.fill()
    ctx.strokeStyle = ready ? 'rgba(212,108,78,0.55)' : 'rgba(212,108,78,0.25)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(ready ? '开始孵化' : '请选两只猫', b.x + b.w / 2, b.y + b.h / 2 + 5)
  }

  _confirmRect() {
    const p = this.panel
    const bw = Math.min(220, p.w - 80)
    return { x: p.x + (p.w - bw) / 2, y: p.y + p.h - 62, w: bw, h: 40 }
  }

  // ---- 孵化：裂缝 → 敲碎 ----
  _renderHatch(ctx) {
    this._drawTitle(ctx, '孵化中…')
    const e = this._eggRect()

    if (this.shatterT < 0) {
      const stage = this.hatchT >= 650 ? 2 : this.hatchT >= 300 ? 1 : 0
      const wob = this.hatchT < 1000 ? Math.sin(this.time * 0.02) * 0.12 * (this.hatchT / 1000) : 0
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(wob)
      drawEgg(ctx, e.r * 2, stage)
      ctx.restore()

      if (this.hatchT >= 1000) {
        const a = 0.55 + 0.45 * Math.sin(this.time * 0.008)
        ctx.save()
        ctx.globalAlpha = a
        ctx.fillStyle = THEME.brick
        ctx.font = 'bold 17px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('点一下，敲开它！', e.x, e.y + e.r + 52)
        ctx.restore()
      }
    } else {
      // 蛋壳缩小消失
      const t = clamp(this.shatterT / 360, 0, 1)
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.scale(1 - t * 0.6, 1 - t * 0.6)
      ctx.globalAlpha = 1 - t
      drawEgg(ctx, e.r * 2, 2)
      ctx.restore()

      // 碎片
      for (const s of this.shards) {
        ctx.save()
        ctx.translate(s.x, s.y)
        ctx.rotate(s.rot)
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.moveTo(0, -s.size * 0.7)
        ctx.lineTo(s.size * 0.6, s.size * 0.5)
        ctx.lineTo(-s.size * 0.6, s.size * 0.5)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
  }

  // ---- 揭晓 ----
  _doneRect() {
    const p = this.panel
    const bw = Math.min(220, p.w - 80)
    return { x: p.x + (p.w - bw) / 2, y: p.y + p.h - 96, w: bw, h: 42 }
  }

  _renderResult(ctx) {
    this._drawTitle(
      ctx,
      this.child.duplicate ? '重复猫 · 分解' : this.child.isNew ? '新猫破壳！' : '小猫破壳！'
    )
    const p = this.panel

    const t = clamp(this.resultT / 420, 0, 1)
    const pop = 1 + (1 - t) * 0.6 * Math.sin(t * Math.PI)
    const cx = p.x + p.w / 2
    const cy = p.y + p.h * 0.4

    // 光晕
    const glowA = 0.35 * (1 - t * 0.4)
    ctx.fillStyle = `rgba(249,224,127,${glowA})`
    ctx.beginPath()
    ctx.arc(cx, cy, 96 * pop, 0, Math.PI * 2)
    ctx.fill()

    const resultImg = getCatSprite(this.child.entry, 168, this.view.dpr)
    if (resultImg) {
      const size = 150 * pop
      ctx.drawImage(resultImg, cx - size / 2, cy - size / 2 + 8, size, size)
    }

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 20px sans-serif'
    ctx.fillText(this.child.entry.name, cx, cy + 100)

    // 代数徽章
    const genText = `${ROMAN[this.child.gen] || this.child.gen}代猫`
    ctx.font = '12px sans-serif'
    const tw = ctx.measureText(genText).width + 22
    roundRectPath(ctx, cx - tw / 2, cy + 112, tw, 22, 11)
    ctx.fillStyle = THEME.teal
    ctx.fill()
    ctx.fillStyle = THEME.cream
    ctx.fillText(genText, cx, cy + 127)

    const mutated = this.child.colorMutated || this.child.patternMutated
    if (this.child.duplicate) {
      // 重复猫：主提示分解所得点数，副提示说明去向（变异信息附在括号里不丢）
      ctx.fillStyle = THEME.brick
      ctx.font = 'bold 17px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`获得 ${this.child.points} 点进化点数`, cx, cy + 150)
      let sub = '图鉴已有同款，已自动分解'
      if (mutated) {
        const parts = []
        if (this.child.colorMutated) parts.push('稀有颜色')
        if (this.child.patternMutated) parts.push('稀有花纹')
        sub = `${sub}（${parts.join(' · ')}）`
      }
      ctx.fillStyle = THEME.inkSoft
      ctx.font = '12px sans-serif'
      ctx.fillText(sub, cx, cy + 172)
    } else {
      let hintColor = this.child.isNew ? THEME.brick : THEME.inkSoft
      let hint = this.child.isNew ? '已自动收入图鉴' : '这只猫已经在图鉴里了'
      if (mutated) {
        hintColor = THEME.brick
        const parts = []
        if (this.child.colorMutated) parts.push('稀有颜色')
        if (this.child.patternMutated) parts.push('稀有花纹')
        hint = `发生变异！${parts.join(' · ')}`
      }
      ctx.fillStyle = hintColor
      ctx.font = `bold ${mutated ? 14 : 13}px sans-serif`
      ctx.fillText(hint, cx, cy + 158)
    }

    const b = this._doneRect()
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 21)
    ctx.fillStyle = THEME.orange
    ctx.fill()
    ctx.strokeStyle = 'rgba(212,108,78,0.55)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 15px sans-serif'
    ctx.fillText('继续游泳', b.x + b.w / 2, b.y + b.h / 2 + 5)
  }
}
