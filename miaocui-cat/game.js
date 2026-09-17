import { Director } from './js/core/director'
import CoverScene from './js/scenes/cover'
import { initState, persist } from './js/data/cats'
import { silentReconcile } from './js/data/achievements'
import { unlockAudio, suspendAudio, resumeAudio } from './js/core/audio'

// 构建指纹：每次改动递增。控制台若看不到这行，说明工具在跑旧缓存代码
console.log('[mcm] BUILD 20260916-30')

// ---- 屏幕信息（逻辑像素 + dpr）----
const system = wx.getSystemInfoSync()
const safe = system.safeArea || { top: 20, bottom: system.windowHeight }
const statusH = Math.max(safe.top, 20)

// ---- 右上角系统胶囊按钮（三个点 + 退出），所有顶部 UI 必须避让 ----
let menu = null
try {
  const r =
    typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null
  if (r && r.width > 0 && r.height > 0) menu = r
} catch (e) {
  menu = null
}
if (!menu) {
  // 兜底：胶囊宽 87、距右 7、距状态栏 6（各机型通用估值）
  const h = 32
  menu = {
    width: 87,
    height: h,
    left: system.windowWidth - 7 - 87,
    right: system.windowWidth - 7,
    top: statusH + 6,
    bottom: statusH + 6 + h
  }
}

// 胶囊下方再留 10px 呼吸间距，作为所有场景内容的顶部安全线
const safeTop = Math.round(menu.bottom + 10)

export const view = {
  w: system.windowWidth,
  h: system.windowHeight,
  dpr: system.pixelRatio || 1,
  topInset: statusH,
  safeTop,
  bottomInset: Math.max(system.windowHeight ? system.windowHeight - safe.bottom : 0, 0),
  // 胶囊矩形（逻辑像素）：右上区域 x ≥ menuLeft 且 y ≤ menuBottom 内不放任何可点元素
  menu
}

// ---- 主画布 ----
const canvas = wx.createCanvas()
canvas.width = Math.floor(view.w * view.dpr)
canvas.height = Math.floor(view.h * view.dpr)

const ctx = canvas.getContext('2d')
ctx.scale(view.dpr, view.dpr) // 之后全部按逻辑像素绘制

// ---- 存档 + 场景 ----
initState()
silentReconcile() // 老存档迁移：已满足的成就静默点亮

const director = new Director(ctx, view)
director.runScene(new CoverScene(view))
director.start()

// ---- 触摸事件统一转发（透传触点 identifier，摇杆靠它锁定手指）----
function eachPoint(list, fn) {
  if (!list) return
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    // 坐标字段回退链：不同运行态（真机/PC 模拟器鼠标）字段可能不同
    const x = t.clientX != null ? t.clientX : t.x != null ? t.x : t.pageX
    const y = t.clientY != null ? t.clientY : t.y != null ? t.y : t.pageY
    fn(x, y, t.identifier)
  }
}

wx.onTouchStart((e) => {
  unlockAudio() // 首次触摸解锁 WebAudio 并起 BGM（自动播放策略）
  eachPoint(e.touches, (x, y, id) => director.dispatch('onTouchStart', x, y, id))
})

wx.onTouchMove((e) => {
  eachPoint(e.touches, (x, y, id) => director.dispatch('onTouchMove', x, y, id))
})

function emitEnd(e) {
  eachPoint(e.changedTouches, (x, y, id) => director.dispatch('onTouchEnd', x, y, id))
}
wx.onTouchEnd(emitEnd)
wx.onTouchCancel(emitEnd)

// 切后台时落盘并挂起音频
wx.onHide(() => {
  persist()
  suspendAudio()
})
wx.onShow(() => {
  resumeAudio()
})
