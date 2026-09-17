import CodexScene from './codex'
import AchievementScene from './achievements'
import ShopScene from './shop'
import Joystick from '../ui/joystick'
import SprintButton from '../ui/sprint'
import BreedFlow from '../ui/breed'
import UpgradePanel from '../ui/upgrade'
import { Fish, makeFishSprites } from '../entities/fish'
import Seabed from '../entities/seabed'
import { drawEgg } from '../entities/egg'
import { preloadCatArt, getCatSprite, drawCatPlaceholder } from '../render/catArt'
import {
  getExp,
  getExpMax,
  gainExp,
  isExpFull,
  getLevel,
  layEgg,
  getEggs,
  addFishEaten,
  getFrenzyCount,
  addFrenzyFish,
  resetFrenzyCount,
  getEvolutionPoints,
  getUpgradeSpeedMult,
  getUpgradeSizeMult,
  getUpgradeComboBonus,
  getActiveCatEntry
} from '../data/cats'
import { evaluateAchievements, drainAchievementToasts } from '../data/achievements'
import { sfx } from '../core/audio'
import { THEME } from '../core/theme'
import { clamp, rand, roundRectPath } from '../core/util'

const FISH_COUNT = 9
const CAT_SPEED = 0.17 // px/ms
const JOY_ZONE = 0.42 // 屏幕上方 42% 留给 UI/点按，下方才唤起摇杆
const SPRINT_SUBSTEP = 12 // 移动分段步进上限 px（小于吃鱼半径直径，加速不穿模漏判）

// —— 肥猫狂暴 ——
const FRENZY_TRIGGER = 30 // 普通状态累计吃满 30 条触发一次
const FRENZY_DURATION = 12000 // 狂暴持续 12s
const FRENZY_FISH_MULT = 3 // 狂暴期鱼群目标数量倍率
const FRENZY_CAT_SCALE = 1.3 // 狂暴期立绘放大倍数（纯视觉，不吃碰撞半径）
const FRENZY_EXP_MULT = 2 // 狂暴期吃鱼经验倍率（与连吃加成在同一出口相乘叠加）
const FISH_MAX = 40 // 屏幕上同屏鱼数硬上限（性能兜底）

// —— 连吃 ——
const COMBO_WINDOW = 2000 // 超过 2s 没吃到鱼，连吃清零
const COMBO_BONUS_STEP = 2 // 第 n 条加成 = (n-1)×2 经验
const COMBO_TIER1 = 5 // ≥5：奶油黄档
const COMBO_TIER2 = 10 // ≥10：砖红高亮档（数字弹跳更猛）

// —— 狂暴出场动画：大猫右下角外斜滑入，露上半身停 2s，再斜滑回 ——
const INTRO_IN = 360
const INTRO_HOLD = 2000
const INTRO_OUT = 360
const INTRO_TOTAL = INTRO_IN + INTRO_HOLD + INTRO_OUT
const INTRO_TEXT = '嘎嘎，大吃爆吃'

/**
 * 探索区（2D 俯视角海底）
 * 摇杆游动 → 碰鱼自动吃（缩放动画）→ +经验 → 顶部经验条
 */
export default class ExploreScene {
  constructor(view) {
    this.view = view
    this.time = 0

    // 玩家猫：取图鉴中第一只已解锁的猫
    this.catEntry = getActiveCatEntry() // 当前主控猫（存档 activeCatId，未设则取首只）
    this.catSize = 88
    preloadCatArt()

    // 玩家在无限世界中的坐标，摄像机始终居中跟随
    this.player = {
      x: 0,
      y: 0,
      r: 28,
      face: 1,
      vx: 0, // 当前摇杆方向（含大小），驱动加速速度线朝向
      vy: 0,
      eatT: 9999, // 吃鱼缩放动画计时
      rippleT: 9999, // 吃鱼光环计时
      swimT: 0, // 游动相位（只有推摇杆时才累加）
      moveAmt: 0 // 0 静止漂浮 ~ 1 全速游，平滑过渡，驱动姿态混合
    }

    // 无限海底（珊瑚 / 海草 / 岩石，分块视差 + 碰撞）
    this.seabed = new Seabed(view)
    // 出生点若恰好压在珊瑚/岩石上，先挪出来
    const safe = this.seabed.resolveCollision(0, 0, this.player.r * 0.78)
    this.player.x = safe.x
    this.player.y = safe.y

    // 鱼（世界坐标，无边界，游远后从镜头外游回；颜色按权重随机）
    const sprites = makeFishSprites(view.dpr)
    this.fishSprites = sprites
    this.fishes = []
    for (let i = 0; i < FISH_COUNT; i++) {
      this.fishes.push(new Fish(sprites, view, this.player))
    }

    // 肥猫狂暴状态机：count 走存档（切图鉴/成就/重开不丢），vis 肥度、glow 光效是场景内平滑值
    this.frenzy = { active: false, t: 0, count: getFrenzyCount(), vis: 1, glow: 0 }

    // 连吃：count 当前条数、t 距上一条的 ms、pop 数字弹跳、tier 颜色档
    this.combo = { count: 0, t: 0, pop: 0, tier: 0 }

    // 狂暴出场动画时间线（仅触发时存在，播完置 null）
    this.frenzyIntro = null

    this.joy = new Joystick()
    this.sprint = new SprintButton(view) // 右下角按住加速（持续/冷却状态机）
    this.breed = new BreedFlow(view)
    this.upgradePanel = new UpgradePanel(view) // 强化弹层（游速/体型/连吃时间）
    this.breed.onClose = (info) => {
      // 孵化结束后确保摇杆不粘住；重复猫分解时弹“获得 X 点进化点数”
      this.joy.release()
      if (info && info.decomposePoints > 0) {
        this.notice = { text: `获得 ${info.decomposePoints} 点进化点数`, t: 0 }
        this._ptsPop = 1.4 // 顶部点数胶囊同步弹一下
      }
    }
    // 强化弹层关闭：把存档里的等级刷新到本场景（速度乘数/体型半径/连吃窗口）
    this.upgradePanel.onClose = () => {
      this._applyUpgrades()
      this.joy.release()
    }
    // 强化效果缓存（购买后关闭弹层时刷新；新场景构造时从存档读）
    this.upSpeedMult = 1
    this.upSizeMult = 1
    this.comboWindow = COMBO_WINDOW
    this._applyUpgrades()
    this.exp = getExp()
    this.expMax = getExpMax()
    this.floats = [] // “+20” 飘字
    this.trail = [] // 加速拖尾气泡（世界坐标）
    this._trailT = 0 // 拖尾生成节流
    this.notice = { text: '', t: 9999 }
    this.achBanners = [] // 成就解锁横幅（只展示，不拦截触摸）
    this._ptsPop = 0 // 进化点胶囊弹跳量（分解获得时弹一下，指数回落）
    this._initDecor()

    // 顶栏与胶囊按钮垂直对齐、横向绝不越过胶囊左缘
    const headY = view.menu.top
    const headH = Math.max(28, view.menu.height)
    this.backBtn = { x: 12, y: headY, w: 62, h: headH }
    // 孵化槽：胶囊安全线以下的左侧（右上角不放任何可点按钮）
    this.eggBtn = { x: 40, y: view.safeTop + 32, r: 22 }
    // 特殊猫商店入口：右上角第三颗胶囊（进化点数胶囊正下方，与成就/强化同列）
    this.shopBtn = { x: view.w - 76, y: view.safeTop + 68, w: 64, h: 26 }
    // 强化入口：右上角，成就按钮左侧并排（系统胶囊安全线以下）
    this.upgradeBtn = { x: view.w - 126, y: view.safeTop + 8, w: 56, h: 26 }
    // 成就入口：胶囊正下方右侧（避开胶囊本体，安全线以下）
    this.achBtn = { x: view.w - 62, y: view.safeTop + 8, w: 50, h: 26 }
  }

  /** 从存档刷新全局强化：速度乘数、体型（视觉+吃鱼/碰撞半径）、连吃窗口 */
  _applyUpgrades() {
    this.upSpeedMult = getUpgradeSpeedMult()
    this.upSizeMult = getUpgradeSizeMult()
    this.comboWindow = COMBO_WINDOW + getUpgradeComboBonus()
    this.player.r = 28 * this.upSizeMult
  }

  _initDecor() {
    const { w, h } = this.view
    // 气泡是屏幕空间的环境氛围，海底装饰全部由 Seabed 无限生成
    this.bubbles = []
    for (let i = 0; i < 16; i++) {
      this.bubbles.push({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(2, 7),
        speed: rand(0.008, 0.03),
        phase: rand(0, Math.PI * 2)
      })
    }
    // 漂浮微粒：更小更密，缓慢上升 + 轻微横摆，营造水流感
    this.motes = []
    for (let i = 0; i < 28; i++) {
      this.motes.push({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(0.8, 2.2),
        speed: rand(0.006, 0.018),
        phase: rand(0, Math.PI * 2),
        a: rand(0.1, 0.3)
      })
    }
  }

  // ----------------------------------------------------------------
  update(dt) {
    this.time += dt
    const { w, h } = this.view

    // 孵化弹层动画（弹层打开时猫停在原地，鱼继续游）
    this.breed.update(dt)
    this.upgradePanel.update(dt) // 强化弹层购买弹跳计时
    if (this.notice.t < 9999) this.notice.t += dt

    // 任意全屏弹层（孵化 / 强化）打开：加速、狂暴、连吃计时全部挂起
    const modalOpen = this.breed.active || this.upgradePanel.active
    // 加速计时：弹层打开视为暂停，持续/冷却计时同步挂起
    this.sprint.update(modalOpen ? 0 : dt)
    // 狂暴倒计时同样在弹层期间挂起
    if (!modalOpen && this.frenzy.active) {
      this.frenzy.t -= dt
      if (this.frenzy.t <= 0) this._endFrenzy()
    }
    // 出场动画时间线（弹层期间一并挂起，播完自动注销）
    if (this.frenzyIntro && !modalOpen) {
      this.frenzyIntro.t += dt
      if (this.frenzyIntro.t >= INTRO_TOTAL) this.frenzyIntro = null
    }
    // 立绘肥度向目标值平滑（进场渐肥 / 退场缩回）
    const fzTarget = this.frenzy.active ? FRENZY_CAT_SCALE : 1
    this.frenzy.vis += (fzTarget - this.frenzy.vis) * Math.min(1, dt / 170)
    // 边缘发光 / 横幅 / 猫光环统一走 glow 淡入淡出（退场也有余韵，不硬切）
    const glowTarget = this.frenzy.active ? 1 : 0
    this.frenzy.glow += (glowTarget - this.frenzy.glow) * Math.min(1, dt / 220)

    // 连吃：窗口（孵化/强化弹层期间挂起，与狂暴/加速一致）；弹跳量指数回落
    const cb = this.combo
    if (cb.count > 0 && !modalOpen) {
      cb.t += dt
      if (cb.t >= this.comboWindow) {
        cb.count = 0
        cb.t = 0
        cb.tier = 0
      }
    }
    cb.pop *= Math.exp(-dt / 150)
    // 进化点胶囊获得时的弹跳量指数回落
    this._ptsPop *= Math.exp(-dt / 180)

    // 猫随摇杆在无限世界里移动，大珊瑚 / 岩石会挡住猫
    if (!modalOpen) {
      const v = this.joy.vector
      const mag = clamp(Math.hypot(v.x, v.y), 0, 1)
      this.player.vx = v.x
      this.player.vy = v.y
      // 加速只放大移动速度（倍率出口唯一，在 sprint 状态机内）；upSpeedMult 为全局强化
      const stepX = v.x * CAT_SPEED * this.sprint.speedMult * this.upSpeedMult * dt
      const stepY = v.y * CAT_SPEED * this.sprint.speedMult * this.upSpeedMult * dt

      // 高速防穿模：把单帧位移切成 ≤12px 的小段逐段推进，
      // 每小段都做珊瑚阻挡 + 吃鱼判定，路径上贴着的鱼一条都不会漏
      const moveDist = Math.hypot(stepX, stepY)
      const n = Math.max(1, Math.ceil(moveDist / SPRINT_SUBSTEP))
      for (let i = 0; i < n; i++) {
        const sx = this.player.x + stepX / n
        const sy = this.player.y + stepY / n
        const fixed = this.seabed.resolveCollision(sx, sy, this.player.r * 0.78)
        this.player.x = fixed.x
        this.player.y = fixed.y
        this._checkEat()
      }

      if (v.x > 0.15) this.player.face = 1
      else if (v.x < -0.15) this.player.face = -1

      // 姿态混合量：推摇杆多少就有多“在游”，松手平滑回到漂浮
      const k = Math.min(1, dt / 140)
      this.player.moveAmt += (mag - this.player.moveAmt) * k
      // 游得越快摆动节奏越快；加速时再提一档，配合速度线表现冲刺
      this.player.swimT += dt * (0.4 + mag) * (this.sprint.active ? 1.7 : 1)

      // 加速拖尾：有方向时每 55ms 留一个奶油黄气泡，460ms 淡出
      if (this.sprint.active && mag > 0.2) {
        this._trailT -= dt
        if (this._trailT <= 0) {
          this.trail.push({ x: this.player.x, y: this.player.y, t: 0 })
          if (this.trail.length > 12) this.trail.shift()
          this._trailT = 55
        }
      }
    } else {
      this.player.moveAmt += (0 - this.player.moveAmt) * Math.min(1, dt / 200)
    }
    for (const q of this.trail) q.t += dt
    this.trail = this.trail.filter((q) => q.t < 460)
    this.player.eatT += dt
    this.player.rippleT += dt

    // 鱼
    for (const f of this.fishes) f.update(dt, this.time)
    this._sweepRetiredFish() // 狂暴退场增援游离镜后回收

    // 鱼本帧游进猫身上也要吃（步进判定覆盖猫路径，这里覆盖鱼路径）
    this._checkEat()

    // 飘字
    for (const ft of this.floats) {
      ft.t += dt
      ft.y -= 0.035 * dt
    }
    this.floats = this.floats.filter((ft) => ft.t < 900)

    // 气泡
    for (const b of this.bubbles) {
      b.y -= b.speed * dt
      if (b.y < -10) {
        b.y = h + 10
        b.x = rand(0, w)
      }
    }

    // 微粒：上升 + 正弦横摆
    for (const m of this.motes) {
      m.y -= m.speed * dt
      m.x += Math.sin(this.time * 0.0008 + m.phase) * 0.008 * dt
      if (m.y < -6) {
        m.y = h + 6
        m.x = rand(0, w)
      }
      if (m.x < -6) m.x = w + 6
      else if (m.x > w + 6) m.x = -6
    }

    // 成就解锁横幅：取队列、计时、自动消失（纯展示，不拦截任何操作）
    const fresh = drainAchievementToasts()
    for (const a of fresh) {
      this.achBanners.push({ a, t: 0 })
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'medium' })
    }
    // 弹层打开时成就横幅挂起排队，关闭后再播放，不遮挡弹层按钮
    if (!modalOpen) {
      for (const bn of this.achBanners) bn.t += dt
      this.achBanners = this.achBanners.filter((bn) => bn.t < 3200)
    }
  }

  /** 吃到一条鱼：连吃 +1、窗口重置；跨过 5/10 档时弹跳更猛 */
  _bumpCombo() {
    const cb = this.combo
    cb.count += 1
    cb.t = 0
    const tier = cb.count >= COMBO_TIER2 ? 2 : cb.count >= COMBO_TIER1 ? 1 : 0
    const tierUp = tier > cb.tier
    cb.tier = tier
    cb.pop = tierUp ? 1.5 : 1
  }

  /**
   * 触发肥猫狂暴：鱼群补到 3 倍（同屏硬上限 40），增援鱼从镜头外涌入。
   * 狂暴期吃鱼不计入累计；结束时累计清零重来（见 _endFrenzy / _checkEat）。
   */
  _startFrenzy() {
    const fz = this.frenzy
    fz.active = true
    fz.t = FRENZY_DURATION
    resetFrenzyCount() // 存档清零，下一轮从 0 重新累计
    fz.count = 0
    const target = Math.min(FISH_COUNT * FRENZY_FISH_MULT, FISH_MAX)
    while (this.fishes.length < target) {
      const f = new Fish(this.fishSprites, this.view, this.player)
      f._spawnAtEdge() // 从镜头外圆环游入，不凭空刷脸
      this.fishes.push(f)
    }
    this.notice = { text: '肥猫狂暴！鱼群翻三倍', t: 0 }
    this.frenzyIntro = { t: 0 } // 大猫探出头的出场动画，2.72s 后自动注销
    this.sprint.forceAuto() // 狂暴期间自动加速（代管模式，结束由 _endFrenzy 收口）
    if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'heavy' })
    sfx.levelUp() // 与升级同音的长喵，作为触发听觉提示
  }

  /** 结束狂暴：累计清零；增援鱼径直游离镜头，出镜后由 _sweepRetiredFish 回收 */
  _endFrenzy() {
    const fz = this.frenzy
    fz.active = false
    fz.t = 0
    fz.count = 0
    this.sprint.endAuto() // 自动加速收口，回到手动加速规则
    for (let i = FISH_COUNT; i < this.fishes.length; i++) {
      const f = this.fishes[i]
      if (f._gone) continue
      if (!f.alive) f._gone = true // 正在等待重生的增援鱼直接回收，不重生
      else f._retire = true
    }
    this._sweepRetiredFish()
  }

  /** 回收已游离镜头（或已被标记）的狂暴增援鱼，基础 9 条永不动 */
  _sweepRetiredFish() {
    if (this.fishes.length <= FISH_COUNT) return
    this.fishes = this.fishes.filter((f, i) => i < FISH_COUNT || !f._gone)
  }

  /**
   * 吃鱼判定：遍历活鱼，猫的边缘与鱼的边缘一接触即算吃到
   * （两圆外切判定：圆心距 ≤ 猫半径 + 鱼半径）。
   * 移动分段步进时每小段调用一次，鱼更新后再调用一次，
   * 保证高速冲刺下沿路径的鱼不穿模、不漏判。
   */
  _checkEat() {
    for (const f of this.fishes) {
      if (!f.alive) continue
      const hitR = this.player.r + f.r // 边缘接触即吃到（圆外切）
      if (Math.hypot(f.x - this.player.x, f.y - this.player.y) <= hitR) {
        // 连吃先续上：第 n 条基础经验 +(n-1)×2（狂暴期吃鱼也计入连吃）
        this._bumpCombo()
        const comboBonus = (this.combo.count - 1) * COMBO_BONUS_STEP
        // 经验唯一出口：(基础 + 连吃加成) × 狂暴倍率，两机制相乘叠加
        const expMult = this.frenzy.active ? FRENZY_EXP_MULT : 1
        const gained = gainExp(Math.round((f.expValue + comboBonus) * expMult)) // 绿黄+10 / 蓝粉+25 / 紫金+50
        addFishEaten(f.colorKey) // 计数 + 记录鱼种类（隐藏成就）
        evaluateAchievements() // 吃鱼数里程碑
        this.player.eatT = 0
        this.player.rippleT = 0
        f.kill()
        this.floats.push({
          x: this.player.x,
          y: this.player.y - 34,
          text: `+${gained}`,
          t: 0,
          c: expMult > 1 ? THEME.brick : THEME.butter // 狂暴双倍飘砖红，一眼区分
        })
        if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
        sfx.eat() // 短促高音喵

        // 经验满 → 立刻下一颗空蛋进孵化槽，经验清零
        if (isExpFull()) {
          sfx.levelUp() // 稍长喵叫（升级）
          setTimeout(() => sfx.layEgg(), 280) // 柔和喵叫（下蛋），错开不叠音
          layEgg() // layEgg 内部清零经验并把下一轮所需 +100
          this.notice = { text: '下了一颗空蛋！点左上孵化槽', t: 0 }
        }
        this.exp = getExp()
        this.expMax = getExpMax()

        // 狂暴累计（写存档）：仅普通状态计数，吃满 30 触发；狂暴期吃鱼只给经验，不计数
        if (!this.frenzy.active) {
          this.frenzy.count = addFrenzyFish()
          if (this.frenzy.count >= FRENZY_TRIGGER) this._startFrenzy()
        }
      }
    }
  }

  // ----------------------------------------------------------------
  onTouchStart(x, y, id) {
    // 全屏弹层打开时，所有触摸交给对应弹层
    if (this.upgradePanel.active) {
      this.upgradePanel.onTouchStart(x, y, id)
      return
    }
    if (this.breed.active) {
      this.breed.onTouchStart(x, y, id)
      return
    }

    const b = this.backBtn
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      this.director.runScene(new CodexScene(this.view))
      return
    }

    // 成就入口（胶囊下方右侧）
    const a = this.achBtn
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
      this.director.runScene(new AchievementScene(this.view, 'explore'))
      return
    }

    // 强化入口（孵化槽右侧）：与孵化一致，打开时加速视为松手收口
    const u = this.upgradeBtn
    if (x >= u.x && x <= u.x + u.w && y >= u.y && y <= u.y + u.h) {
      this.sprint.forceRelease()
      this.joy.release()
      this.upgradePanel.open()
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' })
      return
    }

    // 孵化槽
    if (getEggs().length) {
      const e = this.eggBtn
      if (Math.hypot(x - e.x, y - e.y) <= e.r + 8) {
        // 打开孵化弹层：加速视为松手收口（加速中断进冷却），计时随弹层暂停
        this.sprint.forceRelease()
        this.breed.open(getEggs()[0])
        return
      }
    }

    // 特殊猫商店入口（右上角胶囊）
    const sp = this.shopBtn
    if (x >= sp.x && x <= sp.x + sp.w && y >= sp.y && y <= sp.y + sp.h) {
      this.sprint.forceRelease()
      this.joy.release()
      this.director.runScene(new ShopScene(this.view, 'explore'))
      return
    }

    // 右下角加速按钮：命中则由它独占这根手指（不会同时唤起摇杆）。
    // 冷却中 / 加速中按下无效，仅吸收触摸。
    if (this.sprint.hit(x, y)) {
      if (this.sprint.press(id) && typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({ type: 'light' })
      }
      return
    }

    // 下半屏动态唤起摇杆（加速按钮区域已被上面截走，互不重叠）
    if (!this.joy.active && y > this.view.h * JOY_ZONE) {
      this.joy.attach(x, y, id)
    }
  }

  onTouchMove(x, y, id) {
    if (this.breed.active || this.upgradePanel.active) return
    // 按住加速键的那根手指只负责加速，绝不驱动摇杆
    if (this.sprint.pointerId === id) return
    if (this.joy.active && id === this.joy.activeId) this.joy.move(x, y)
  }

  onTouchEnd(x, y, id) {
    if (this.breed.active || this.upgradePanel.active) return
    if (this.sprint.pointerId === id) {
      this.sprint.release(id) // 松开立即结束加速 → 冷却
      return
    }
    if (this.joy.active && id === this.joy.activeId) this.joy.release()
  }

  // ----------------------------------------------------------------
  render(ctx) {
    const { w, h } = this.view

    // —— 屏幕层：海水渐变、光束、深浅水团、远/中视差装饰、微粒与气泡 ——
    this._drawBackground(ctx)
    this._drawLightBeams(ctx)
    this.seabed.renderParallax(ctx, this.player.x, this.player.y, this.time)
    this._drawMotes(ctx)
    this._drawBubbles(ctx)

    // —— 世界层：摄像机始终把猫放在画面中心 ——
    ctx.save()
    ctx.translate(w / 2 - this.player.x, h / 2 - this.player.y)
    this.seabed.renderNear(ctx, this.player.x, this.player.y, this.time)
    this._drawTrail(ctx)
    for (const f of this.fishes) f.render(ctx, this.time)
    this._drawFloats(ctx)
    this._drawSpeedLines(ctx)
    this._drawPlayer(ctx)
    ctx.restore()

    // —— 屏幕层 UI ——
    this._drawFrenzyEdge(ctx) // 狂暴暖色边光（盖世界层、压在 UI 下）
    this._drawHUD(ctx)
    this._drawFrenzyBanner(ctx)
    this._drawNotice(ctx)
    this.joy.render(ctx)
    this.sprint.render(ctx, this.time) // 加速按钮盖在摇杆之上，右下角始终可点
    // 探索页版本角标：加速按钮正上方（看不到 V23 = 旧缓存）
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,248,231,0.85)'
    ctx.fillText('V23', w - 8, this.sprint.cy - this.sprint.r - 9)
    this._drawFrenzyIntro(ctx) // 狂暴大猫探出场动画（几何上避让加速键，无触摸热区）
    this.breed.render(ctx)
    this.upgradePanel.render(ctx) // 强化弹层（与孵化同级，二者互斥）
    this._drawAchBanners(ctx) // 最上层小横幅（弹层打开时挂起不画）
  }

  /** 成就解锁小横幅：底部向上堆叠滑入，奶油黄高亮，几秒后淡出，不响应触摸 */
  _drawAchBanners(ctx) {
    if (!this.achBanners.length || this.breed.active || this.upgradePanel.active) return
    const { w, h, bottomInset } = this.view
    const bw = Math.min(300, w - 32)
    const bh = 52
    const gap = 8

    this.achBanners.slice(0, 3).forEach((bn, i) => {
      const t = bn.t
      const inK = clamp(t / 220, 0, 1)
      const outK = t > 2700 ? clamp(1 - (t - 2700) / 500, 0, 1) : 1
      const slide = (1 - inK) * 30
      // 最新一条贴底部安全区，更早的向上堆叠，避开顶栏与孵化槽
      const baseY = h - Math.max(bottomInset, 12) - 16 - bh
      const y = baseY - i * (bh + gap) + slide
      const x = (w - bw) / 2
      ctx.save()
      ctx.globalAlpha = inK * outK

      roundRectPath(ctx, x, y, bw, bh, 14)
      ctx.fillStyle = THEME.cream
      ctx.fill()
      ctx.strokeStyle = THEME.butter
      ctx.lineWidth = 2
      ctx.stroke()

      // 左侧奶油黄奖章圆
      ctx.beginPath()
      ctx.arc(x + 26, y + bh / 2, 17, 0, Math.PI * 2)
      ctx.fillStyle = THEME.butter
      ctx.fill()
      // 奖章上的小星星
      ctx.fillStyle = THEME.brick
      const sx = x + 26
      const sy = y + bh / 2
      ctx.beginPath()
      for (let k = 0; k < 5; k++) {
        const ang = -Math.PI / 2 + (k * Math.PI * 2) / 5
        const ang2 = ang + Math.PI / 5
        ctx.lineTo(sx + Math.cos(ang) * 8, sy + Math.sin(ang) * 8)
        ctx.lineTo(sx + Math.cos(ang2) * 3.4, sy + Math.sin(ang2) * 3.4)
      }
      ctx.closePath()
      ctx.fill()

      ctx.textAlign = 'left'
      ctx.fillStyle = THEME.brick
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('成就解锁', x + 52, y + 20)
      ctx.fillStyle = THEME.ink
      ctx.font = 'bold 15px sans-serif'
      ctx.fillText(bn.a.name, x + 52, y + 39)
      ctx.restore()
    })
  }

  // 场景切出时确保摇杆不粘住、加速状态收口
  onExit() {
    this.joy.release()
    this.sprint.forceRelease()
  }

  _drawBackground(ctx) {
    const { w, h } = this.view
    if (!this._bgGrad) {
      // 深浅不一的蓝色层次：近水面透亮，越往下越深越蓝
      this._bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      this._bgGrad.addColorStop(0, '#DCEDEB')
      this._bgGrad.addColorStop(0.32, '#ABCFD1')
      this._bgGrad.addColorStop(0.64, '#7FB1C3')
      this._bgGrad.addColorStop(1, '#5E92AC')

      this._glow = ctx.createRadialGradient(w / 2, h * 0.14, 10, w / 2, h * 0.14, h * 0.6)
      this._glow.addColorStop(0, 'rgba(255,255,255,0.4)')
      this._glow.addColorStop(1, 'rgba(255,255,255,0)')

      // 三团缓慢漂移的深浅水团（归一化坐标，角速度极慢）
      this._patches = [
        { x: 0.24, y: 0.3, r: 0.55, c: 'rgba(255,255,255,0.09)', wx: 0.00022, wy: 0.00016 },
        { x: 0.78, y: 0.62, r: 0.6, c: 'rgba(94,146,172,0.16)', wx: -0.00018, wy: 0.00013 },
        { x: 0.5, y: 0.96, r: 0.66, c: 'rgba(38,77,89,0.14)', wx: 0.00015, wy: -0.00011 }
      ]
    }
    ctx.fillStyle = this._bgGrad
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = this._glow
    ctx.fillRect(0, 0, w, h)

    // 深浅水团：正弦漂移，叠加出海水流动的层次
    for (const p of this._patches) {
      const px = (p.x + Math.sin(this.time * p.wx) * 0.07) * w
      const py = (p.y + Math.cos(this.time * p.wy) * 0.05) * h
      const g = ctx.createRadialGradient(px, py, 8, px, py, p.r * w)
      g.addColorStop(0, p.c)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  }

  _drawLightBeams(ctx) {
    // 固定的两束柔光，纯半透明多边形，开销很小
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    const { h } = this.view
    ctx.beginPath()
    ctx.moveTo(this.view.w * 0.16, 0)
    ctx.lineTo(this.view.w * 0.4, 0)
    ctx.lineTo(this.view.w * 0.26, h * 0.7)
    ctx.lineTo(this.view.w * 0.04, h * 0.7)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(this.view.w * 0.66, 0)
    ctx.lineTo(this.view.w * 0.86, 0)
    ctx.lineTo(this.view.w * 0.96, h * 0.6)
    ctx.lineTo(this.view.w * 0.78, h * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  _drawMotes(ctx) {
    for (const m of this.motes) {
      const sx = m.x + Math.sin(this.time * 0.0008 + m.phase) * 3
      ctx.fillStyle = `rgba(255,248,231,${m.a})`
      ctx.beginPath()
      ctx.arc(sx, m.y, m.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _drawBubbles(ctx) {
    for (const b of this.bubbles) {
      const sx = b.x + Math.sin(this.time * 0.0012 + b.phase) * 4
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath()
      ctx.arc(sx, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.beginPath()
      ctx.arc(sx - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** 加速拖尾：奶油黄气泡随时间变大淡出（世界坐标，画在猫身后） */
  _drawTrail(ctx) {
    if (!this.trail.length) return
    for (const q of this.trail) {
      const k = q.t / 460
      ctx.beginPath()
      ctx.arc(q.x, q.y, 5 + k * 16, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(249,224,127,${0.3 * (1 - k)})`
      ctx.fill()
      ctx.beginPath()
      ctx.arc(q.x, q.y, (5 + k * 16) * 0.45, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,248,231,${0.28 * (1 - k)})`
      ctx.fill()
    }
  }

  /** 加速速度线：猫身后 3 道奶白短线，沿移动反方向，长度随节奏脉动 */
  _drawSpeedLines(ctx) {
    if (!this.sprint.active) return
    const p = this.player
    const mag = Math.hypot(p.vx, p.vy)
    if (mag < 0.2) return
    // 身后方向 + 垂直方向（用于三道线错位）
    const back = Math.atan2(p.vy, p.vx) + Math.PI
    const bx = Math.cos(back)
    const by = Math.sin(back)
    const px = -by
    const py = bx
    const offsets = [-16, 0, 16]
    const lens = [20, 30, 18]
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineWidth = 3
    for (let i = 0; i < 3; i++) {
      const pulse = 0.65 + 0.35 * Math.sin(this.time * 0.025 + i * 2.1)
      const ox = px * offsets[i]
      const oy = py * offsets[i]
      const x0 = p.x + bx * p.r * 0.72 + ox
      const y0 = p.y + by * p.r * 0.72 + oy
      const len = lens[i] * pulse
      ctx.strokeStyle = `rgba(255,248,231,${0.55 * pulse})`
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x0 + bx * len, y0 + by * len)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** 狂暴猫脚下的暖色光环（离屏缓存，仅绘制 drawImage） */
  _getFrenzyAura() {
    const { dpr } = this.view
    if (this._aura && this._auraDpr === dpr) return this._aura
    const S = 220
    const c = wx.createCanvas()
    c.width = S * dpr
    c.height = S * dpr
    const g = c.getContext('2d')
    g.scale(dpr, dpr)
    const grad = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2)
    grad.addColorStop(0, 'rgba(249,224,127,0.65)')
    grad.addColorStop(0.55, 'rgba(249,173,106,0.32)')
    grad.addColorStop(1, 'rgba(212,108,78,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)
    this._aura = c
    this._auraDpr = dpr
    return c
  }

  /** 屏幕四周暖色发光边（全屏离屏缓存，按机型尺寸只画一次） */
  _getFrenzyEdge() {
    const { w, h, dpr } = this.view
    const key = `${w}x${h}@${dpr}`
    if (this._edge && this._edgeKey === key) return this._edge
    const c = wx.createCanvas()
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    const g = c.getContext('2d')
    g.scale(dpr, dpr)
    const D = Math.max(120, Math.min(w, h) * 0.22)
    const strip = (x0, y0, x1, y1) => {
      const lg = g.createLinearGradient(x0, y0, x1, y1)
      lg.addColorStop(0, 'rgba(212,108,78,0.55)')
      lg.addColorStop(0.45, 'rgba(249,173,106,0.22)')
      lg.addColorStop(1, 'rgba(249,173,106,0)')
      g.fillStyle = lg
      g.fillRect(0, 0, w, h)
    }
    g.save()
    g.beginPath(); g.rect(0, 0, w, D); g.clip(); strip(0, 0, 0, D); g.restore()
    g.save()
    g.beginPath(); g.rect(0, h - D, w, D); g.clip(); strip(0, h, 0, h - D); g.restore()
    g.save()
    g.beginPath(); g.rect(0, 0, D, h); g.clip(); strip(0, 0, D, 0); g.restore()
    g.save()
    g.beginPath(); g.rect(w - D, 0, D, h); g.clip(); strip(w, 0, w - D, 0); g.restore()
    this._edge = c
    this._edgeKey = key
    return c
  }

  _drawFrenzyEdge(ctx) {
    if (this.frenzy.glow <= 0.02) return
    const { w, h } = this.view
    const pulse = 0.72 + 0.28 * Math.sin(this.time * 0.012)
    ctx.save()
    ctx.globalAlpha = this.frenzy.glow * pulse
    ctx.drawImage(this._getFrenzyEdge(), 0, 0, w, h)
    ctx.restore()
  }

  /**
   * 连吃胶囊：经验条正下方左侧。
   * <5 主橙 / 5-9 奶油黄 / ≥10 砖红+脉冲光晕；吃鱼数字弹跳，跨档弹更猛；
   * 胶囊底部 3px 细条是 2s 连吃窗口倒计时。
   */
  _drawComboPill(ctx, x, y) {
    const cb = this.combo
    if (cb.count < 2) return

    const TIER_STYLE = [
      { fill: THEME.orange, text: THEME.cream },
      { fill: THEME.butter, text: THEME.ink },
      { fill: THEME.brick, text: THEME.cream }
    ]
    const st = TIER_STYLE[cb.tier]

    ctx.font = 'bold 11px sans-serif'
    const labelW = ctx.measureText('连吃').width
    const numStr = `×${cb.count}`
    ctx.font = 'bold 16px sans-serif'
    const numW = ctx.measureText(numStr).width
    const padX = 9
    const gap = 4
    const pw = padX + labelW + gap + numW + padX
    const ph = 20
    const cx = x + pw / 2
    const cy = y + ph / 2
    // 普通吃鱼弹 25%，跨过 5/10 档额外弹到 45%
    const scale =
      1 + 0.25 * clamp(cb.pop, 0, 1) + 0.2 * clamp(cb.pop - 1, 0, 0.5)

    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.translate(-cx, -cy)

    // 高档脉冲光晕（无 shadowBlur：多画一层半透明圆角底）
    if (cb.tier === 2) {
      const pulse = 0.45 + 0.4 * Math.sin(this.time * 0.015)
      roundRectPath(ctx, x - 4, y - 4, pw + 8, ph + 8, 14)
      ctx.fillStyle = `rgba(212,108,78,${0.28 * pulse})`
      ctx.fill()
    }

    roundRectPath(ctx, x, y, pw, ph, ph / 2)
    ctx.fillStyle = st.fill
    ctx.fill()

    ctx.textAlign = 'left'
    ctx.fillStyle = st.text
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('连吃', x + padX, y + 14)
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(numStr, x + padX + labelW + gap, y + 15)
    ctx.restore()

    // 2s 窗口倒计时细条（不参与缩放，宽度跟随胶囊）
    const ratio = 1 - clamp(cb.t / this.comboWindow, 0, 1)
    ctx.fillStyle = 'rgba(255,248,231,0.45)'
    ctx.fillRect(x, y + ph + 2, pw, 3)
    ctx.fillStyle = st.fill
    ctx.fillRect(x, y + ph + 2, pw * ratio, 3)
  }

  /**
   * 狂暴出场动画：当前猫的放大立绘从右下角外斜滑入，只露头和上半身
   * （下半身画在屏幕外，靠画布天然裁剪），停 2s 后原路斜滑回；
   * 旁边带奶油白对话框。休息位几何上严格位于加速键左侧，纵向远离
   * 顶部经验条/连吃胶囊/右上角菜单胶囊。
   */
  _drawFrenzyIntro(ctx) {
    const it = this.frenzyIntro
    if (!it) return
    const { w, h, safeTop, dpr } = this.view
    const t = it.t

    // 滑移动画进度 offK：进场 1→0（easeOut），退场 0→1（easeIn）
    let offK
    if (t < INTRO_IN) {
      const x = t / INTRO_IN
      offK = 1 - (1 - x) * (1 - x) * (1 - x)
    } else if (t < INTRO_IN + INTRO_HOLD) {
      offK = 0
    } else {
      const x = clamp((t - INTRO_IN - INTRO_HOLD) / INTRO_OUT, 0, 1)
      offK = x * x * x
    }

    // 大猫休息位：右侧贴加速键左边 18px，中心压到屏幕底沿以下 2%，露出约一半上身
    const B = this._introSize || (this._introSize = Math.round(clamp(w * 0.66, 210, 270)))
    const sp = this.sprint
    const restX = sp.cx - sp.r - 18 - B / 2
    const restY = h - B * 0.02
    const dx = B * 0.9 * offK
    const dy = B * 0.9 * offK
    const cx = restX + dx
    const cy = restY + dy

    // 大猫（面向屏幕中心，即水平翻转；首次取该尺寸 catArt 同步生成）
    const spr = getCatSprite(this.catEntry, B, dpr)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(-1, 1)
    if (spr) ctx.drawImage(spr, -B / 2, -B / 2, B, B)
    else drawCatPlaceholder(ctx, B)
    ctx.restore()

    // 对话框透明度：进场快淡入，退场随滑移淡出
    let alpha = clamp(t / 200, 0, 1)
    if (t > INTRO_IN + INTRO_HOLD) {
      const x = clamp((t - INTRO_IN - INTRO_HOLD) / INTRO_OUT, 0, 1)
      alpha *= 1 - x
    }
    if (alpha <= 0.01) return

    ctx.font = 'bold 15px sans-serif'
    const tw = ctx.measureText(INTRO_TEXT).width
    const bw = Math.ceil(tw) + 28
    const bh = 42
    // 休息位：对话框贴着大猫头顶偏左；夹在安全区内，顶部不越过经验条/连吃区
    let bx = restX - B * 0.1 - bw
    bx = clamp(bx, 10, w - bw - 10)
    const by = clamp(restY - B / 2 + B * 0.05, safeTop + 96, h - 130)
    // 跟随大猫做 55% 视差滑移，退场时一起往右下飘
    const fx = bx + dx * 0.55
    const fy = by + dy * 0.55

    ctx.save()
    ctx.globalAlpha = alpha
    // 轻阴影：禁用 shadowBlur（性能约定），用偏移的同形状暗色圆角模拟
    roundRectPath(ctx, fx, fy + 3, bw, bh, 14)
    ctx.fillStyle = 'rgba(38,77,89,0.20)'
    ctx.fill()
    // 指向大猫的小三角尾巴
    ctx.beginPath()
    ctx.moveTo(fx + bw - 8, fy + bh - 6)
    ctx.lineTo(fx + bw - 28, fy + bh - 2)
    ctx.lineTo(fx + bw + 4, fy + bh + 13)
    ctx.closePath()
    ctx.fillStyle = 'rgba(38,77,89,0.16)'
    ctx.fill()
    // 奶油白气泡本体 + 细边
    roundRectPath(ctx, fx, fy, bw, bh, 14)
    ctx.fillStyle = THEME.cream
    ctx.fill()
    ctx.strokeStyle = 'rgba(38,77,89,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(fx + bw - 10, fy + bh - 5)
    ctx.lineTo(fx + bw - 28, fy + bh - 3)
    ctx.lineTo(fx + bw + 2, fy + bh + 11)
    ctx.closePath()
    ctx.fillStyle = THEME.cream
    ctx.fill()
    // 暗海蓝文字
    ctx.fillStyle = THEME.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(INTRO_TEXT, fx + bw / 2, fy + bh / 2 + 1)
    ctx.restore()
  }

  /** 顶部居中狂暴横幅：标题 + 经验×2 + 剩余时间条 */
  _drawFrenzyBanner(ctx) {
    const fz = this.frenzy
    if (fz.glow <= 0.02 || !fz.active) return
    const { w, safeTop } = this.view
    const bw = 188
    const bh = 46
    const x = (w - bw) / 2
    const y = safeTop + 64
    const elapsed = FRENZY_DURATION - fz.t
    const pop = 1 + 0.14 * (1 - clamp(elapsed / 220, 0, 1)) // 触发瞬间弹一下
    ctx.save()
    ctx.globalAlpha = fz.glow
    ctx.translate(w / 2, y + bh / 2)
    ctx.scale(pop, pop)
    ctx.translate(-w / 2, -(y + bh / 2))

    roundRectPath(ctx, x, y, bw, bh, 14)
    ctx.fillStyle = THEME.brick
    ctx.fill()
    ctx.strokeStyle = THEME.butter
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('肥猫狂暴', x + 14, y + 21)
    ctx.textAlign = 'right'
    ctx.fillStyle = THEME.butter
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('经验×2', x + bw - 12, y + 20)

    // 剩余时间细条
    const barX = x + 12
    const barW = bw - 24
    ctx.fillStyle = 'rgba(255,248,231,0.35)'
    ctx.fillRect(barX, y + bh - 11, barW, 4)
    ctx.fillStyle = THEME.butter
    ctx.fillRect(barX, y + bh - 11, barW * clamp(fz.t / FRENZY_DURATION, 0, 1), 4)
    ctx.restore()
  }

  _drawPlayer(ctx) {
    const p = this.player
    const moving = p.moveAmt
    const idle = 1 - moving

    // 狂暴暖色光环（画在最底层，随肥度轻微呼吸）
    if (this.frenzy.glow > 0.02) {
      const auraPulse = 1 + 0.07 * Math.sin(this.time * 0.012)
      const S = 220 * auraPulse
      ctx.save()
      ctx.globalAlpha = this.frenzy.glow
      ctx.drawImage(this._getFrenzyAura(), p.x - S / 2, p.y - S / 2, S, S)
      ctx.restore()
    }

    // —— 游动姿态（推摇杆时）：身体沿游动节奏上下起伏 + 左右微摆 ——
    const swimWave = Math.sin(p.swimT * 0.014)
    const swimBob = swimWave * 3.2 * moving
    const roll = Math.sin(p.swimT * 0.014 + Math.PI / 2) * 0.07 * moving
    // 划水时身体轻微纵向拉伸
    const swimSx = 1 - 0.02 * swimWave * moving
    const swimSy = 1 + 0.025 * swimWave * moving

    // —— 漂浮姿态（松手时）：缓慢呼吸式缩放 + 极轻起伏，不完全静止 ——
    const breath = 1 + 0.03 * Math.sin(this.time * 0.003) * idle
    const idleBob = 1.3 * Math.sin(this.time * 0.0026) * idle

    // 吃鱼反馈：咬合瞬间横向挤压 → 纵向回弹，指数衰减振荡（约 460ms 平复）
    let eatX = 1
    let eatY = 1
    if (p.eatT < 460) {
      const decay = Math.exp(-p.eatT / 150)
      const osc = Math.sin(p.eatT / 36)
      eatX = 1 + 0.12 * decay * osc
      eatY = 1 - 0.12 * decay * osc
    }

    const sx = swimSx * breath * eatX
    const sy = swimSy * breath * eatY

    // 吞鱼光环：从身边向外扩散的奶油色圆环（画在猫身后）
    if (p.rippleT < 420) {
      const k = p.rippleT / 420
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.strokeStyle = `rgba(249,224,127,${0.65 * (1 - k)})`
      ctx.lineWidth = 3.5 * (1 - k) + 1
      ctx.beginPath()
      ctx.arc(0, 0, 24 + k * 48, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.translate(p.x, p.y + swimBob + idleBob)
    ctx.rotate(roll)
    // frenzy.vis：普通态 1，狂暴态平滑放大到 1.3（纯视觉肥度）
    // upSizeMult：体型强化（与吃鱼/碰撞半径同一乘数）
    ctx.scale(
      p.face * sx * this.frenzy.vis * this.upSizeMult,
      sy * this.frenzy.vis * this.upSizeMult
    )
    const spr = getCatSprite(this.catEntry, this.catSize, this.view.dpr)
    if (spr) {
      ctx.drawImage(spr, -this.catSize / 2, -this.catSize / 2, this.catSize, this.catSize)
    } else {
      drawCatPlaceholder(ctx, this.catSize)
    }
    ctx.restore()
  }

  _drawFloats(ctx) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.font = 'bold 18px sans-serif'
    for (const ft of this.floats) {
      const alpha = ft.t < 150 ? ft.t / 150 : 1 - (ft.t - 150) / 750
      ctx.globalAlpha = clamp(alpha, 0, 1)
      ctx.fillStyle = ft.c || THEME.butter // 狂暴期双倍经验飘砖红
      ctx.strokeStyle = 'rgba(38,77,89,0.55)'
      ctx.lineWidth = 3
      ctx.strokeText(ft.text, ft.x, ft.y)
      ctx.fillText(ft.text, ft.x, ft.y)
    }
    ctx.restore()
  }

  _drawHUD(ctx) {
    const { w, menu } = this.view

    // 返回按钮（主橙 + 砖红描边 + 奶油白字），与胶囊同行但居最左
    const b = this.backBtn
    roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2)
    ctx.fillStyle = THEME.orange
    ctx.fill()
    ctx.strokeStyle = 'rgba(212,108,78,0.55)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.cream
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('图鉴', b.x + b.w / 2, b.y + b.h / 2 + 4.5)

    // 经验条（奶油黄 → 深海青）：右缘止于胶囊左缘 -10px，与胶囊垂直居中对齐
    const barX = b.x + b.w + 10
    const barW = Math.max(60, menu.left - 10 - barX)
    const barH = 18
    const barY = b.y + (b.h - barH) / 2
    if (!this._expGrad) {
      this._expGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
      this._expGrad.addColorStop(0, THEME.butter)
      this._expGrad.addColorStop(1, THEME.teal)
    }

    roundRectPath(ctx, barX, barY, barW, barH, 9)
    ctx.fillStyle = 'rgba(255,248,231,0.75)'
    ctx.fill()
    ctx.strokeStyle = THEME.seaLine
    ctx.lineWidth = 1.2
    ctx.stroke()

    ctx.save()
    roundRectPath(ctx, barX, barY, barW, barH, 9)
    ctx.clip()
    const expMax = getExpMax() // 每轮递增：100 / 200 / 300 …
    const ratio = clamp(this.exp / expMax, 0, 1)
    if (ratio > 0) {
      ctx.fillStyle = this._expGrad
      ctx.fillRect(barX, barY, barW * ratio, barH)
    }
    ctx.restore()

    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      `Lv.${getLevel()} · ${this.exp}/${expMax}`,
      barX + barW / 2,
      barY + barH / 2 + 4
    )

    // 经验条下方一行：左侧连吃胶囊，右侧狂暴蓄力小字（狂暴中蓄力让位给横幅）
    this._drawComboPill(ctx, barX, barY + barH + 3)
    if (!this.frenzy.active) {
      ctx.fillStyle = THEME.navy
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(
        `狂暴蓄力 ${this.frenzy.count}/${FRENZY_TRIGGER}`,
        barX + barW,
        barY + barH + 15
      )
    }

    // 成就入口：奶油底 + 深海青描边小胶囊（位于胶囊正下方，不与任何 UI 重叠）
    const a = this.achBtn
    roundRectPath(ctx, a.x, a.y, a.w, a.h, a.h / 2)
    ctx.fillStyle = 'rgba(255,248,231,0.92)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(67,151,141,0.7)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = THEME.teal
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🏆成就', a.x + a.w / 2, a.y + a.h / 2 + 4.5)

    // 强化入口：孵化槽右侧同行，奶油底 + 鎏金描边（呼应进化点）
    const u = this.upgradeBtn
    roundRectPath(ctx, u.x, u.y, u.w, u.h, u.h / 2)
    ctx.fillStyle = 'rgba(255,248,231,0.92)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,171,63,0.8)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    // 小上箭头
    const ax = u.x + 13
    const ay = u.y + u.h / 2
    ctx.strokeStyle = '#d8ab3f'
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ax, ay + 4)
    ctx.lineTo(ax, ay - 4)
    ctx.moveTo(ax - 3.5, ay - 1)
    ctx.lineTo(ax, ay - 4.5)
    ctx.lineTo(ax + 3.5, ay - 1)
    ctx.stroke()
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('强化', u.x + 22, u.y + u.h / 2 + 4.5)

    // 孵化槽：有空蛋时显示（奶油圆盘 + 小蛋 + 数量角标）
    const eggs = getEggs()
    if (eggs.length) {
      const e = this.eggBtn
      const pulse = 1 + 0.05 * Math.sin(this.time * 0.005)
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.scale(pulse, pulse)
      ctx.beginPath()
      ctx.arc(0, 0, e.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,248,231,0.85)'
      ctx.fill()
      ctx.strokeStyle = THEME.seaLine
      ctx.lineWidth = 1.4
      ctx.stroke()
      const es = 26
      drawEgg(ctx, es, 0)
      ctx.restore()

      // 数量角标
      const bx = e.x + e.r - 4
      const by = e.y - e.r + 4
      ctx.beginPath()
      ctx.arc(bx, by, 10, 0, Math.PI * 2)
      ctx.fillStyle = THEME.brick
      ctx.fill()
      ctx.fillStyle = THEME.cream
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(eggs.length), bx, by + 4)
    }

    // 特殊猫商店入口：右上角第三颗胶囊（奶油底 + 鎏金描边 + 购物袋图标，与成就/强化同列）
    const sp = this.shopBtn
    roundRectPath(ctx, sp.x, sp.y, sp.w, sp.h, sp.h / 2)
    ctx.fillStyle = 'rgba(255,248,231,0.92)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,171,63,0.8)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    // 购物袋图标：圆角袋身 + 半圆提手
    const bx0 = sp.x + 14
    const bcx = sp.y + sp.h / 2
    ctx.strokeStyle = '#d8ab3f'
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(bx0 + 5.5, bcx - 2.5, 4, Math.PI, 0)
    ctx.stroke()
    roundRectPath(ctx, bx0, bcx - 2.5, 11, 9.5, 2.5)
    ctx.fillStyle = THEME.butter
    ctx.fill()
    ctx.strokeStyle = '#d8ab3f'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('商店', bx0 + 17, bcx + 4.5)

    // 进化点数胶囊：成就按钮正下方（系统胶囊安全线以下），右缘与成就钮对齐
    const pts = getEvolutionPoints()
    const label = `进化点 ${pts}`
    ctx.font = 'bold 11px sans-serif'
    const pw = Math.ceil(ctx.measureText(label).width) + 34
    const ph = 20
    const px = w - 12 - pw
    const py = this.achBtn.y + this.achBtn.h + 6
    const pop = 1 + 0.22 * clamp(this._ptsPop, 0, 1.2)
    ctx.save()
    ctx.translate(px + pw / 2, py + ph / 2)
    ctx.scale(pop, pop)
    ctx.translate(-(px + pw / 2), -(py + ph / 2))
    roundRectPath(ctx, px, py, pw, ph, ph / 2)
    ctx.fillStyle = 'rgba(255,248,231,0.92)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,171,63,0.8)' // 鎏金描边，呼应“进化”
    ctx.lineWidth = 1.2
    ctx.stroke()
    // 金色四角小星
    const sx = px + 15
    const sy = py + ph / 2
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
    ctx.fillText(label, px + 24, py + ph / 2 + 0.5)
    ctx.restore()
  }

  /** 屏幕中部 toast（如下蛋提示） */
  _drawNotice(ctx) {
    const t = this.notice.t
    if (!this.notice.text || t > 2200) return
    const alpha = t < 200 ? t / 200 : t > 1800 ? 1 - (t - 1800) / 400 : 1
    const { w, safeTop } = this.view
    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    ctx.font = 'bold 14px sans-serif'
    const tw = ctx.measureText(this.notice.text).width + 36
    const x = (w - tw) / 2
    // 胶囊下第二行（孵化槽在同行最右，文案居中且够短，不会相撞）
    const y = safeTop + 56
    roundRectPath(ctx, x, y, tw, 34, 17)
    ctx.fillStyle = 'rgba(38,77,89,0.82)'
    ctx.fill()
    ctx.fillStyle = THEME.cream
    ctx.textAlign = 'center'
    ctx.fillText(this.notice.text, w / 2, y + 22)
    ctx.restore()
  }
}
