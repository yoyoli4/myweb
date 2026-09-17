'use client'

import { useEffect, useState } from 'react'
import { playTear } from '@/lib/sound'
import { ambientMusic } from '@/lib/music'

/**
 * 入场票据：左半为入场券正文（深紫纸面，宽高比 3:1），
 * 右半为金色票根（宽高比 1:1.6），满铺闪烁金箔。
 * 闭合的鎏金金线帘幕铺满视口（在票下方），点击 → 票沿锯齿撕成两半飞散 →
 * 帘幕从中间向两侧缓缓拉开，两缘留下极细金边后淡出 → 主页面显现。
 * 同一标签页只出现一次（sessionStorage）。
 */

type Stage = 'idle' | 'tearing' | 'curtain' | 'edges' | 'done'

const SEEN_KEY = 'ssw-entered-v4'

// 时序：撕票飞散 → 帘幕缓拉 → 金边残留 → 淡出 → 卸载
const T_TEAR = 1300
const T_CURTAIN_OPEN = 2700
const T_EDGE_HOLD = 850
const T_EDGE_FADE = 750

/* ======================== 鎏金帘幕 ======================== */

const THREAD_COUNT = 82
const THREAD_GRADIENTS = ['thread-a', 'thread-b', 'thread-c'] as const

interface ThreadSpec {
  leftPct: number
  width: number
  opacity: number
  cls: (typeof THREAD_GRADIENTS)[number]
  sx: number
  sr: number
  dur: number
  delay: number
  height: number
  tx: string
  rot: string
  pullDelay: string
}

/** 确定性伪随机，保证服务端/客户端渲染一致 */
function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * 整屏金线：u = 距中缝的归一距离（中缝=1，两缘=0）。
 * 开幕时中线行程最大、最先动身；贴边线几乎不走、最后才动，
 * 于是幕布前沿被拉出一道自然弧线，两缘最后残留为金色流苏。
 */
function buildThreads(): ThreadSpec[] {
  return Array.from({ length: THREAD_COUNT }).map((_, i) => {
    const h1 = hash(i * 3.1 + 5)
    const h2 = hash(i * 7.7 + 9)
    const h3 = hash(i * 13.3 + 21)
    const h4 = hash(i * 17.9 + 47)
    const pitch = 100 / THREAD_COUNT
    const jitter = (h1 - 0.5) * pitch * 0.85
    const x = Math.min(99.4, Math.max(0.6, (i + 0.5) * pitch + jitter))
    const u = 1 - Math.abs(x - 50) / 50
    const sign = x < 50 ? -1 : 1
    const nearCenter = u > 0.97
    const flick = i % 2 === 0 ? 1 : -1
    return {
      leftPct: x,
      width: nearCenter ? 1.05 : 0.4 + h2 * 0.55,
      opacity: Math.min(0.95, 0.24 + h3 * 0.28 + u * 0.32),
      cls: THREAD_GRADIENTS[Math.floor(h4 * 3) % 3],
      sx: 0.9 + h2 * 2.1,
      sr: 0.07 + h3 * 0.18,
      dur: 6.8 + h4 * 5.2,
      delay: -(h1 * 12),
      height: 93 + h2 * 9,
      tx: `${(sign * u * 56).toFixed(2)}vw`,
      rot: `${(sign * (0.22 + u * 1.55) + flick * 0.28 * u).toFixed(2)}deg`,
      pullDelay: `${((1 - u) * 0.5).toFixed(2)}s`,
    }
  })
}

const THREADS = buildThreads()

function ThreadLine({ t }: { t: ThreadSpec }) {
  return (
    <span
      className={`curtain-thread ${t.cls}`}
      style={
        {
          left: `${t.leftPct}%`,
          width: `${t.width.toFixed(2)}px`,
          height: `${t.height.toFixed(1)}%`,
          opacity: t.opacity.toFixed(2),
          '--sx': `${t.sx.toFixed(2)}px`,
          '--sr': `${t.sr.toFixed(2)}deg`,
          '--dur': `${t.dur.toFixed(2)}s`,
          '--delay': `${t.delay.toFixed(2)}s`,
          '--tx': t.tx,
          '--rot': t.rot,
          '--pull-delay': t.pullDelay,
        } as React.CSSProperties
      }
    />
  )
}

/** 金线帘幕：闭合时金线遮满整屏，pulling 时从中缝向两侧带弧拉开 */
function GoldCurtain({ pulling }: { pulling: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[5] ${pulling ? 'curtain-pulling' : ''}`}
      aria-hidden
    >
      <div className={`curtain-seam-glow ${pulling ? 'opacity-0' : 'opacity-100'}`} />
      <div className="curtain-layer">
        <div className="curtain-folds" />
        {THREADS.map((t, i) => (
          <ThreadLine key={i} t={t} />
        ))}
      </div>
    </div>
  )
}

const POEM: [string, string][] = [
  ['Life is a shit sea,', 'and I am a fish.'],
  ['Ocean is too huge,', 'and I can’t breathe.'],
  ['Voyages are long,', 'and destinations are far.'],
  ['Endless torture,', 'I almost can see my destiny.'],
]

const TEETH = 26
const TOOTH = 11

// 左半正文 2.4:1，右半票根 1:1.6；总宽高比 2.4 + 1/1.6 = 3.025
const LEFT_FRAC = 2.4 / 3.025
const RIGHT_FRAC = 1 - LEFT_FRAC
const SEAM_LEFT = `${(LEFT_FRAC * 100).toFixed(3)}%`

/** 右缘锯齿（左半票） */
function jaggedRight(teeth: number, depth: number) {
  const pts: string[] = []
  for (let i = 0; i <= teeth; i++) {
    const y = (i / teeth) * 100
    const x = i % 2 === 0 ? '100%' : `calc(100% - ${depth}px)`
    pts.push(`${x} ${y}%`)
  }
  return `polygon(0 0, ${pts.join(',')}, 0 100%)`
}

/** 左缘锯齿（右半票） */
function jaggedLeft(teeth: number, depth: number) {
  const pts: string[] = []
  for (let i = 0; i <= teeth; i++) {
    const y = (i / teeth) * 100
    const x = i % 2 === 0 ? '0' : `${depth}px`
    pts.push(`${x} ${y}%`)
  }
  return `polygon(${pts.join(',')}, 100% 100%, 100% 0)`
}

const CLIP_L = jaggedRight(TEETH, TOOTH)
const CLIP_R = jaggedLeft(TEETH, TOOTH)

/** 阿基米德螺旋路径（克林姆特式卷涡） */
function spiral(cx: number, cy: number, rMax: number, turns: number, start = 0, rMin = 1.5) {
  const steps = 72
  let d = ''
  for (let k = 0; k <= steps; k++) {
    const t = k / steps
    const r = rMin + t * (rMax - rMin)
    const a = start + turns * 2 * Math.PI * t
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `
  }
  return d
}

/** 棋盘格方块阵 */
function CheckerBlock({
  x,
  y,
  cols,
  rows,
  cell,
}: {
  x: number
  y: number
  cols: number
  rows: number
  cell: number
}) {
  const shades = ['#7a4a10', '#f6e099', '#cf9d36', '#3a2406', 'none', '#b8822a']
  return (
    <g stroke="#3a2406" strokeWidth="0.8">
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const fill = shades[(r * 7 + c * 13) % 6]
          return (
            <rect
              key={`${r}-${c}`}
              x={x + c * cell}
              y={y + r * cell}
              width={cell - 0.8}
              height={cell - 0.8}
              fill={fill}
              opacity={fill === 'none' ? 0 : 0.96}
            />
          )
        }),
      )}
    </g>
  )
}

/** 闪烁金光点（CSS 动画驱动） */
const SPARKLES = Array.from({ length: 26 }).map((_, i) => ({
  x: 8 + ((i * 53) % 84),
  y: 6 + ((i * 37) % 88),
  s: 1 + (i % 3),
  d: `${(i % 7) * 0.27}s`,
  dur: `${1.6 + (i % 5) * 0.5}s`,
}))

/** 满铺金箔场：螺旋砖 + 棋盘格 + 眼形三角 + 散点方块 + 闪烁高光 */
function GoldField({ className }: { className?: string }) {
  const medallions = [
    { x: 210, y: 70, r: 20 },
    { x: 50, y: 96, r: 18 },
    { x: 214, y: 188, r: 18 },
    { x: 56, y: 246, r: 16 },
    { x: 132, y: 30, r: 14 },
    { x: 132, y: 252, r: 15 },
  ]
  const eyes = [
    { x: 100, y: 48 },
    { x: 172, y: 140 },
    { x: 86, y: 166 },
    { x: 168, y: 258 },
  ]
  const rects = [
    [224, 40, 16, 13], [16, 132, 13, 17], [240, 138, 13, 16], [22, 28, 17, 13],
    [226, 222, 15, 19], [16, 210, 16, 12], [88, 12, 13, 12], [102, 270, 17, 13],
    [242, 252, 12, 15], [82, 196, 13, 15],
  ]
  return (
    <svg viewBox="0 0 260 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="foil-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1bd" />
          <stop offset="0.18" stopColor="#f0cf72" />
          <stop offset="0.4" stopColor="#d4a142" />
          <stop offset="0.58" stopColor="#b07d22" />
          <stop offset="0.74" stopColor="#e0b552" />
          <stop offset="0.88" stopColor="#a87524" />
          <stop offset="1" stopColor="#f6e099" />
        </linearGradient>
        <linearGradient id="foil-hi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <pattern id="dot-tile" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="0.8" fill="#4d3308" opacity="0.55" />
        </pattern>
        <pattern id="spiral-tile" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d={spiral(20, 20, 14.5, 1.9, -0.6)} fill="none" stroke="#4d3308" strokeWidth="1.1" opacity="0.6" />
          <circle cx="7" cy="33" r="1.1" fill="#4d3308" opacity="0.6" />
          <circle cx="33" cy="9" r="0.85" fill="#4d3308" opacity="0.55" />
        </pattern>
        <filter id="foil-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" />
        </filter>
        <filter id="foil-spec">
          <feTurbulence type="turbulence" baseFrequency="0.012 0.9" numOctaves="2" seed="3" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.5" />
          </feComponentTransfer>
        </filter>
      </defs>

      <rect width="260" height="300" fill="url(#foil-gold)" />
      <rect width="260" height="300" fill="url(#dot-tile)" />
      <rect width="260" height="300" fill="url(#spiral-tile)" />
      {/* 斑驳颗粒 */}
      <rect width="260" height="300" filter="url(#foil-noise)" opacity="0.22" />
      {/* 竖向高光拉丝 */}
      <rect width="260" height="300" filter="url(#foil-spec)" opacity="0.14" />

      <CheckerBlock x={14} y={12} cols={6} rows={6} cell={14} />
      <CheckerBlock x={176} y={16} cols={5} rows={5} cell={12} />
      <CheckerBlock x={14} y={206} cols={5} rows={5} cell={12} />
      <CheckerBlock x={170} y={214} cols={6} rows={6} cell={13} />

      {medallions.map((m, i) => (
        <g key={i}>
          <circle cx={m.x} cy={m.y} r={m.r + 2.2} fill="none" stroke="#3a2406" strokeWidth="0.75" strokeDasharray="1.5 1.8" opacity="0.8" />
          <circle cx={m.x} cy={m.y} r={m.r} fill="#e6bd56" stroke="#3a2406" strokeWidth="1.4" />
          <circle cx={m.x} cy={m.y} r={m.r - 3} fill="none" stroke="#fff4cf" strokeWidth="0.6" opacity="0.7" />
          <path d={spiral(m.x, m.y, m.r - 5, 2.4, 0.4)} fill="none" stroke="#3a2406" strokeWidth="1.1" />
          <circle cx={m.x} cy={m.y} r="2.6" fill="#3a2406" />
        </g>
      ))}

      {eyes.map((e, i) => {
        const s = 22
        return (
          <g key={i}>
            <path
              d={`M${e.x} ${e.y - s} L${e.x + s} ${e.y + s * 0.72} L${e.x - s} ${e.y + s * 0.72} Z`}
              fill="#e7c265"
              stroke="#3a2406"
              strokeWidth="1.15"
            />
            <circle cx={e.x} cy={e.y + 2} r="6.2" fill="#f7e5a8" stroke="#3a2406" strokeWidth="0.95" />
            <circle cx={e.x} cy={e.y + 2} r="2.4" fill="#3a2406" />
          </g>
        )
      })}

      {rects.map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={i % 2 ? '#e9c368' : '#f6e099'}
          stroke="#3a2406"
          strokeWidth="0.85"
          opacity="0.94"
        />
      ))}

      {/* 顶部白色高光带 */}
      <rect width="260" height="60" fill="url(#foil-hi)" opacity="0.5" />

      {/* 闪烁高光点 */}
      {SPARKLES.map((sp, i) => (
        <circle
          key={i}
          cx={(sp.x / 100) * 260}
          cy={(sp.y / 100) * 300}
          r={sp.s}
          fill="#fff7dd"
          className="gold-sparkle"
          style={{ animationDelay: sp.d, animationDuration: sp.dur }}
        />
      ))}
    </svg>
  )
}

/** 深色票面上的金饰横带：菱形 + 方点 + 连线 */
function OrnateBand({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden>
      <defs>
        <pattern id="band-tile" width="30" height="14" patternUnits="userSpaceOnUse">
          <line x1="0" y1="2" x2="30" y2="2" stroke="#b99a52" strokeWidth="0.55" opacity="0.85" />
          <line x1="0" y1="12" x2="30" y2="12" stroke="#b99a52" strokeWidth="0.55" opacity="0.85" />
          <rect x="13.3" y="5.3" width="3.4" height="3.4" transform="rotate(45 15 7)" fill="#C9A961" />
          <rect x="14" y="6" width="2" height="2" transform="rotate(45 15 7)" fill="#E3CB8F" />
          <rect x="0.9" y="5.6" width="2.8" height="2.8" fill="#8A7443" opacity="0.9" />
          <rect x="26.3" y="5.6" width="2.8" height="2.8" fill="#8A7443" opacity="0.9" />
        </pattern>
      </defs>
      <rect width="300" height="14" fill="url(#band-tile)" />
    </svg>
  )
}

/** 角花 */
function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden fill="none">
      <path d="M2 62 V20 Q2 4 20 4 H62" stroke="currentColor" strokeWidth="1.1" opacity="0.9" />
      <path d="M10 54 V24 Q10 12 24 12 H54" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
      <path d="M14 14 q10 0 10 10 q-10 0 -10 -10" fill="currentColor" opacity="0.85" />
      <circle cx="14" cy="14" r="2.1" fill="#171023" />
      <circle cx="30" cy="8" r="1.1" fill="currentColor" opacity="0.7" />
      <circle cx="8" cy="30" r="1.1" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

/** 鱼徽章：跟随 currentColor，金底上用深色 */
function FishEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none">
      <circle cx="50" cy="50" r="47" stroke="currentColor" strokeWidth="1.6" opacity="0.85" />
      <circle cx="50" cy="50" r="41" stroke="currentColor" strokeWidth="0.7" opacity="0.45" />
      {Array.from({ length: 30 }).map((_, i) => {
        const a = (i / 30) * Math.PI * 2
        return (
          <circle key={i} cx={50 + Math.cos(a) * 47} cy={50 + Math.sin(a) * 47} r="1.2" fill="currentColor" opacity="0.8" />
        )
      })}
      <path
        d="M28 50 Q44 34 62 50 Q44 66 28 50 Z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <path d="M62 50 L77 38 L77 62 Z" fill="currentColor" opacity="0.9" />
      <circle cx="38" cy="47.5" r="2.4" fill="currentColor" />
    </svg>
  )
}

function Barcode() {
  const bars = [3, 1, 2, 1, 1, 4, 2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 4, 2]
  return (
    <div className="origin-center scale-[0.6] sm:scale-100">
      <div className="flex h-6 items-stretch gap-[3px] sm:h-7">
        {bars.map((w, i) => (
          <span key={i} className="block bg-gold-bright/80" style={{ width: `${w}px` }} />
        ))}
      </div>
      <p className="mt-1 text-center text-[8px] tracking-[0.42em] text-gold-dim sm:mt-1.5 sm:text-[9px]">
        SSW · 2026 · NO.000001
      </p>
    </div>
  )
}

/** 撕开时迸出的金箔碎 */
const FLAKES = [
  { y: '24%', dir: -1, dx: 90, dy: 120, rot: 220, s: 7, d: '0s' },
  { y: '35%', dir: 1, dx: 120, dy: 150, rot: -180, s: 6, d: '0.08s' },
  { y: '47%', dir: -1, dx: 70, dy: 180, rot: 260, s: 9, d: '0.02s' },
  { y: '56%', dir: 1, dx: 140, dy: 130, rot: -240, s: 5, d: '0.14s' },
  { y: '66%', dir: -1, dx: 100, dy: 200, rot: 300, s: 8, d: '0.05s' },
  { y: '76%', dir: 1, dx: 130, dy: 170, rot: -150, s: 6, d: '0.12s' },
]

/** 票孔：沿撕线均匀分布的小圆孔（真实车票的齿孔） */
const PERFORATIONS = Array.from({ length: 22 }).map((_, i) => ({
  top: `${(i / 21) * 100}%`,
  size: i % 3 === 0 ? 8 : 6,
}))

export default function TicketGate() {
  const [visible, setVisible] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SEEN_KEY)) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  const tear = () => {
    if (stage !== 'idle') return
    playTear()
    void ambientMusic.start().catch(() => {
      /* 音频上下文可能因自动播放策略被拒，忽略 */
    })
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* 隐私模式下忽略 */
    }

    // 减弱动效偏好下整体快进
    const fast =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tTear = fast ? 220 : T_TEAR
    const tOpen = tTear + (fast ? 260 : T_CURTAIN_OPEN)
    const tEdge = tOpen + (fast ? 220 : T_EDGE_HOLD)
    const tFade = tEdge + (fast ? 220 : T_EDGE_FADE)

    setStage('tearing')
    // 票据飞散完毕 → 帘幕向两侧缓拉
    window.setTimeout(() => setStage('curtain'), tTear)
    // 帘幕完全拉开 → 两缘留下极细金边
    window.setTimeout(() => setStage('edges'), tOpen)
    // 金边淡出
    window.setTimeout(() => setStage('done'), tEdge)
    // 整场结束
    window.setTimeout(() => setVisible(false), tFade)
  }

  if (!visible) return null
  const torn = stage !== 'idle'
  const curtainOpen = stage === 'curtain' || stage === 'edges' || stage === 'done'

  return (
    <div
      data-no-click-sound
      className={`fixed inset-0 z-[4000] flex flex-col items-center justify-center overflow-hidden px-3 sm:px-6 ${
        stage === 'idle' ? '' : 'pointer-events-none'
      }`}
      aria-hidden={stage !== 'idle'}
    >
      {/* 墨黑夜底：开幕时缓缓抬升，露出底下的首页 */}
      <div
        className={`gate-bg gate-night pointer-events-none absolute inset-0 ${
          curtainOpen ? 'night-lift' : ''
        }`}
      />

      {/* 鎏金帘幕（在入场券下方） */}
      <GoldCurtain pulling={curtainOpen} />

      {/* 暗金紫光叠在帘幕之上、票据之下，营造层次 */}
      <div
        className={`gate-aurora pointer-events-none absolute inset-[-25%] mix-blend-screen transition-opacity duration-700 ${
          curtainOpen ? 'opacity-0' : ''
        }`}
      />
      <div
        className={`ticket-glow pointer-events-none absolute h-[260px] w-[min(860px,90vw)] rounded-full transition-opacity duration-700 ${
          torn ? 'opacity-0' : ''
        }`}
      />

      <div className={stage === 'idle' ? 'ticket-float relative z-10' : 'relative z-10'}>
        <div
          role="button"
          tabIndex={0}
          aria-label="撕开入场券，进入呕心小世界"
          onClick={tear}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              tear()
            }
          }}
          className="ticket-sleeve ticket-enter group relative flex aspect-[121/40] w-[min(860px,98vw)] cursor-pointer select-none outline-none"
        >
          {/* ============ 左半：深色纸面正文（3:1） ============ */}
          <div
            className={`ticket-half half-left relative shrink-0 ${torn ? 'half-left-out' : ''}`}
            style={{ clipPath: CLIP_L, width: `${(LEFT_FRAC * 100).toFixed(3)}%` }}
          >
            <div className="half-rim h-full w-full rounded-l-[17px] p-[2px] sm:p-[2.5px]">
              <div className="paper-dark half-inner relative flex h-full w-full flex-col items-center overflow-hidden rounded-l-[14px] px-3 py-1.5 text-center sm:rounded-l-[15px] sm:px-8 sm:py-3">
                <span className="pointer-events-none absolute inset-[6px] rounded-lg border border-gold/25 sm:inset-[11px]" />
                <CornerFlourish className="pointer-events-none absolute left-2 top-2 h-5 w-5 text-gold sm:left-3 sm:top-3 sm:h-7 sm:w-7" />
                <CornerFlourish className="pointer-events-none absolute right-2 top-2 h-5 w-5 rotate-90 text-gold sm:right-3 sm:top-3 sm:h-7 sm:w-7" />
                <CornerFlourish className="pointer-events-none absolute bottom-2 left-2 h-5 w-5 -rotate-90 text-gold sm:bottom-3 sm:left-3 sm:h-7 sm:w-7" />
                <CornerFlourish className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 rotate-180 text-gold sm:bottom-3 sm:right-3 sm:h-7 sm:w-7" />
                <span className="foil-grain" />

                <OrnateBand className="h-[5px] w-[86%] sm:h-2" />

                <p className="mt-1 hidden text-[9px] tracking-[0.42em] text-gold-dim [text-indent:0.42em] sm:mt-1.5 sm:block">
                  SICK&nbsp;·&nbsp;SUCK&nbsp;·&nbsp;WORLD
                </p>
                <h2 className="mt-0.5 font-serif text-[18px] leading-none tracking-[0.35em] text-gold-bright [text-indent:0.35em] sm:mt-1 sm:text-[34px]">
                  入场券
                </h2>
                <p className="mt-0.5 text-[8px] tracking-[0.5em] text-wisteria/90 [text-indent:0.5em] sm:mt-1 sm:text-[11px]">
                  欢迎不光临
                </p>
                <span className="mt-0.5 text-[6px] tracking-[0.6em] text-gold/60 sm:mt-1.5 sm:text-[9px]">
                  ◆&nbsp;&nbsp;✦&nbsp;&nbsp;◆
                </span>

                <div className="mt-1 w-full text-center font-serif text-[7px] italic leading-[1.5] tracking-[0.06em] text-[#B9AED4] sm:mt-2 sm:text-[11px] sm:leading-[1.7]">
                  {POEM.map((line, i) => (
                    <p key={i}>
                      {line[0]}
                      <span className="text-gold/80"> {line[1]}</span>
                    </p>
                  ))}
                </div>

                <div className="mt-1 sm:mt-2">
                  <Barcode />
                </div>
                <OrnateBand className="mt-0.5 h-[5px] w-[86%] sm:mt-1.5 sm:h-2" />
              </div>
            </div>
          </div>

          {/* ============ 右半：金色票根（1:1.6） ============ */}
          <div
            className={`ticket-half half-right relative shrink-0 ${torn ? 'half-right-out' : ''}`}
            style={{ clipPath: CLIP_R, width: `${(RIGHT_FRAC * 100).toFixed(3)}%` }}
          >
            <div className="half-rim h-full w-full rounded-r-[17px] p-[2px] sm:p-[2.5px]">
              <div className="paper-dark half-inner relative h-full w-full overflow-hidden rounded-r-[14px] sm:rounded-r-[15px]">
                {/* 满铺金箔板 */}
                <div className="gold-plaque absolute inset-1.5 overflow-hidden rounded-md border border-[#3a2406]/70 shadow-[inset_0_0_24px_rgba(74,47,10,0.35)] sm:inset-2.5">
                  <GoldField className="h-full w-full" />
                  <span className="foil-sheen" />
                </div>
                <FishEmblem className="absolute left-1/2 top-[44%] h-[30%] w-auto -translate-x-1/2 -translate-y-1/2 text-[#2a1a04]" />
                {/* 竖排「票根」：文字朝向右边，纵向排列 */}
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[13px] tracking-[0.5em] text-[#2a1a04] [writing-mode:vertical-rl] sm:text-[20px]">
                  票&nbsp;根
                </span>
              </div>
            </div>
          </div>

          {/* ============ 中央撕线 + 票孔 ============ */}
          <div
            className={`ticket-seam pointer-events-none absolute inset-y-0 w-9 -translate-x-1/2 transition-opacity duration-500 ${
              torn ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ left: SEAM_LEFT }}
          >
            {/* 票孔：沿撕线排列的小圆孔，撕开时从上到下逐个爆开 */}
            {PERFORATIONS.map((p, i) => (
              <span
                key={i}
                className={`perf-hole absolute left-1/2 -translate-x-1/2 rounded-full bg-[#0a0710] ${torn ? 'is-torn' : ''}`}
                style={
                  {
                    top: p.top,
                    width: p.size,
                    height: p.size,
                    boxShadow: 'inset 0 0 0 1px rgba(201,169,97,0.55), 0 0 0 1px rgba(58,36,6,0.4)',
                    animationDelay: `${i * 32}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
            <span className="seam-notch absolute -top-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <span className="seam-notch absolute -bottom-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-full" />
          </div>

          {/* 撕开时从裂缝透出的新世界光芒 */}
          {torn && (
            <span
              className="tear-glow pointer-events-none absolute inset-y-0 w-24 -translate-x-1/2"
              style={{ left: SEAM_LEFT }}
            />
          )}

          {/* 金箔碎：从撕线迸出 */}
          {torn &&
            FLAKES.map((f, i) => (
              <span
                key={i}
                className="paper-frag"
                style={
                  {
                    left: SEAM_LEFT,
                    top: f.y,
                    width: f.s,
                    height: f.s,
                    animationDelay: f.d,
                    '--dx': `${f.dir * f.dx}px`,
                    '--dy': `${f.dy}px`,
                    '--rot': `${f.rot}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
        </div>
      </div>

      <p
        className={`relative z-10 mt-8 text-xs tracking-[0.4em] text-mute transition-opacity duration-500 ${
          stage === 'idle' ? 'ticket-hint' : 'opacity-0'
        }`}
      >
        点击票据 · 撕 开 入 场
      </p>

      {/* 开幕后视口两缘的极细金边 */}
      <span
        className={`curtain-edge curtain-edge-left ${stage === 'edges' ? 'show' : ''} ${
          stage === 'done' ? 'fade' : ''
        }`}
      />
      <span
        className={`curtain-edge curtain-edge-right ${stage === 'edges' ? 'show' : ''} ${
          stage === 'done' ? 'fade' : ''
        }`}
      />
    </div>
  )
}
