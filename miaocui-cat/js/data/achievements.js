/**
 * 成就 / 里程碑系统（只读 cats 的存档状态，解锁结果写回 state.achieved）。
 *
 * 设计：
 *   - ACHIEVEMENTS 是唯一的成就定义表（id / 名称 / 描述 / 目标值 / 图标类型）
 *   - evaluateAchievements() 在吃鱼、孵化后由场景调用，全量重算条件，
 *     新达成的写入存档并进入 pending 队列（去重、只推一次）
 *   - drainAchievementToasts() 由探索区每帧取走队列弹横幅，
 *     横幅不拦截触摸、不暂停游戏
 */
import {
  getOwned,
  getRosterEntry,
  getFishEaten,
  getFishSpeciesCount,
  isAchieved,
  markAchieved
} from './cats'

export const ACHIEVEMENTS = [
  { id: 'colors5', name: '五彩斑斓', desc: '集齐 5 种普通颜色的猫', target: 5, icon: 'palette' },
  { id: 'colors9', name: '九色收藏家', desc: '集齐全部 9 种颜色（含稀有色）', target: 9, icon: 'palette' },
  { id: 'gen2', name: '繁衍生息', desc: '孵出第一只二代猫', target: 1, icon: 'egg' },
  { id: 'gen3', name: '三代同堂', desc: '孵出第一只三代猫', target: 1, icon: 'egg' },
  { id: 'rarePattern', name: '繁星附身', desc: '第一次配出星纹猫', target: 1, icon: 'star' },
  { id: 'rareColor', name: '天赐异色', desc: '第一次配出稀有颜色（紫 / 黑 / 金 / 白）', target: 1, icon: 'star' },
  { id: 'doubleRare', name: '天选之猫', desc: '配出「稀有颜色 + 星纹」的双重稀有猫', target: 1, icon: 'crown' },
  { id: 'fish100', name: '小有口福', desc: '累计吃掉 100 条鱼鱼', target: 100, icon: 'fish' },
  { id: 'fish500', name: '海底贪吃鬼', desc: '累计吃掉 500 条鱼鱼', target: 500, icon: 'fish' },
  { id: 'fish1000', name: '鱼鱼终结者', desc: '累计吃掉 1000 条鱼鱼', target: 1000, icon: 'fish' },
  { id: 'fish2000', name: '传说干饭猫', desc: '累计吃掉 2000 条鱼鱼', target: 2000, icon: 'fish' },
  // 隐藏成就：解锁前在成就页显示为 ？？？，不给任何提示
  { id: 'fishAll', name: '尝遍大海', desc: '六种鱼鱼全都吃过一遍', target: 6, icon: 'fish', hidden: true }
]

const byId = {}
ACHIEVEMENTS.forEach((a) => (byId[a.id] = a))

/** 待弹横幅队列（模块级，场景重建也不丢） */
const pending = []

/** 汇总当前存档里与成就有关的统计（每次调用现算，无状态） */
function collectStats() {
  const normalColors = {}
  const allColors = {}
  let maxGen = 0
  let starCount = 0
  let rareColorCount = 0
  let doubleRareCount = 0

  for (const inst of getOwned()) {
    const e = getRosterEntry(inst.id)
    if (!e) continue
    allColors[e.colorKey] = 1
    if (e.colorRarity === 'normal') normalColors[e.colorKey] = 1
    maxGen = Math.max(maxGen, inst.gen || 1)
    if (e.patternKey === 'stars') starCount += 1
    if (e.colorRarity === 'rare') rareColorCount += 1
    if (e.colorRarity === 'rare' && e.patternKey === 'stars') doubleRareCount += 1
  }

  return {
    normalColorCount: Object.keys(normalColors).length,
    allColorCount: Object.keys(allColors).length,
    maxGen,
    starCount,
    rareColorCount,
    doubleRareCount,
    fishEaten: getFishEaten(),
    fishSpecies: getFishSpeciesCount()
  }
}

/** 各成就的当前进度值 */
function progressOf(id, s) {
  switch (id) {
    case 'colors5':
      return s.normalColorCount
    case 'colors9':
      return s.allColorCount
    case 'gen2':
      return s.maxGen >= 2 ? 1 : 0
    case 'gen3':
      return s.maxGen >= 3 ? 1 : 0
    case 'rarePattern':
      return s.starCount
    case 'rareColor':
      return s.rareColorCount
    case 'doubleRare':
      return s.doubleRareCount
    case 'fish100':
    case 'fish500':
    case 'fish1000':
    case 'fish2000':
      return s.fishEaten
    case 'fishAll':
      return s.fishSpecies
    default:
      return 0
  }
}

/** 全量重算：新达成的成就写存档并进横幅队列；返回本次新解锁列表 */
export function evaluateAchievements() {
  const s = collectStats()
  const unlocked = []
  for (const a of ACHIEVEMENTS) {
    if (!isAchieved(a.id) && progressOf(a.id, s) >= a.target) {
      if (markAchieved(a.id)) {
        pending.push(a)
        unlocked.push(a)
      }
    }
  }
  return unlocked
}

/** 启动时静默补判（老存档迁移：已满足的直接点亮，不弹横幅） */
export function silentReconcile() {
  const s = collectStats()
  for (const a of ACHIEVEMENTS) {
    if (!isAchieved(a.id) && progressOf(a.id, s) >= a.target) markAchieved(a.id)
  }
}

/** 取走待弹横幅（探索区每帧调用，自动清空队列） */
export function drainAchievementToasts() {
  if (!pending.length) return []
  const list = pending.splice(0, pending.length)
  return list
}

/** 成就页用：定义 + 是否已解锁 + 当前进度 */
export function getAchievementStates() {
  const s = collectStats()
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: isAchieved(a.id),
    cur: Math.min(progressOf(a.id, s), a.target)
  }))
}

export function achievedCount() {
  let n = 0
  for (const a of ACHIEVEMENTS) if (isAchieved(a.id)) n += 1
  return n
}

export function getAchievementDef(id) {
  return byId[id] || null
}
