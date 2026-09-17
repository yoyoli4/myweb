'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { fortunes } from '@/data/content'
import type { Fortune } from '@/data/content'
import { playFortuneShake, playFortuneEye, playWoodKnock, playFortuneChar } from '@/lib/sound'

/**
 * 命运抽了下你（/fate）
 *
 * 一条统一时间轴上的仪式：
 *   0.00s 签筒猛震 · 裂纹渗光 · 弦乐低鸣
 *   0.75s 中签缓升 · 左右轻摆 · 金箔星尘飘落
 *   2.25s 出筒停顿
 *   2.55s 翻转 180° · 签身发光
 *   3.45s 眼睛显影 · 瞳孔扩大 · 左右移 · 眨眼
 *   5.97s 翻回正面
 *   6.87s 签文逐字刻显
 *   9.00s 悬浮 · 出现「钉在墙上」「收起来」
 */

type Phase =
  | 'idle'
  | 'shaking'
  | 'rising'
  | 'poised'
  | 'back'
  | 'eye'
  | 'fronting'
  | 'revealed'
  | 'away'

const WALL_KEY = 'ssw-fortune-wall-v1'

type Pinned = Fortune & { pinnedAt: number }

/**
 * 签筒柱身贴图（text_to_image 生成的克里姆特金紫褐漆风真实图片）
 * 接口异步生成，首次进浏览器约 20–40s 内是占位灰图，需刷新出真图。
 * 用 SVG <image> 元素加载，clipPath 裁成八角柱筒身形。
 */
const TUBE_BODY_SRC = '/images/ai/tube-body.jpg'

/**
 * 签身贴图（Klimt 暗金木纹贴皮，已下载到本地）
 * 签是 1:6 细长形，用 object-fit cover 裁切填满；签文/眼睛动画层仍叠在最上。
 */
const STICK_SKIN_SRC = '/images/ai/stick-skin.jpg'

/* —— 绝对时间点（ms）—— */
const T_RISE = 750
const T_KNOCK = 2350
const T_POISE = 2450
const T_FLIP1 = 2750
const T_EYE = 3650
const EYE_STEPS = [T_EYE, 4150, 4650, 5100, 5550, 5850] // 显影→扩瞳→左→右→归位→眨眼
const T_FLIP2 = 6170
const T_CHARS = 7070
const T_REVEALED = 9200
const T_AWAY = 680

const TY_HIDDEN = 'calc(100% - 24px)'
const TY_UP = 'calc(-1 * clamp(68px, 18vw, 94px))'
// 翻面后下移压到筒身前（持在筒前），并放大；放大锚定签底，下移量相应收小
const TY_OUT = 'clamp(46px, 12vw, 62px)'

const TD: Record<Phase, string> = {
  idle: '0ms',
  shaking: '0ms',
  rising: '1.7s',
  poised: '1.7s',
  back: '0.9s',
  eye: '0.9s',
  fronting: '0.9s',
  revealed: '0.9s',
  away: '0.65s',
}

// 出场缓动：起步极缓、中段加速、近顶滑停（舒展的仪式感）
const TE_RISE = 'cubic-bezier(0.32, 0.06, 0.16, 1)'

/* ======================== 签筒 SVG ======================== */

function TubeBack() {
  return (
    <svg
      viewBox="0 0 176 300"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <filter id="ft-tb-blur" x="-40%" y="-250%" width="180%" height="600%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      {/* 落地接触阴影 */}
      <ellipse cx="88" cy="267" rx="55" ry="6.5" fill="rgba(0,0,0,0.55)" filter="url(#ft-tb-blur)" />
      {/* 筒口内部：纯黑，吞掉签的下半截（口上只等着即将抽出的那一根） */}
      <ellipse cx="88" cy="30" rx="70" ry="13" fill="#010101" />
      {/* 筒口后沿：乌木棱 + 断续残金 */}
      <path
        d="M18 30 A70 13 0 0 1 158 30"
        fill="none"
        stroke="#382a1a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M18 30 A70 13 0 0 1 158 30"
        fill="none"
        stroke="#d8b76a"
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeDasharray="13 24 9 30 11 22"
        opacity="0.55"
      />
    </svg>
  )
}

function TubeFront() {
  // 深漆褐金筒 · 克里姆特式金朱纹：
  //   口沿下珍珠链带 · 扇贝连弧 · 中腹杏仁眼主纹带（呼应签背之眼）· 马赛克金红方块链
  //   · 菱形细链 · 足上同心波纹簇；朱红弦纹与签的朱红面板同色
  // 「描画在筒身上」三要点：横纹沿筒身椭圆弧下弯；每笔「暗托→漆层→亮提」三层厚涂；
  // 画完再罩一层随八角面转折的明暗，纹线随之沉入筒面
  const waveClusters = [
    { cx: 50, cy: 216, rs: [12, 9, 6, 3] },
    { cx: 88, cy: 224, rs: [14, 10.5, 7, 3.5] },
    { cx: 124, cy: 214, rs: [11, 8, 5, 2.5] },
  ]
  // 正视圆柱：横圈呈椭圆弧（中段下沉）。edge=两端高度，ry=下垂深度
  const arcY = (x: number, edge: number, ry: number, rx: number) => {
    const t = Math.min(1, Math.abs(x - 88) / rx)
    return edge + ry * Math.sqrt(Math.max(0, 1 - t * t))
  }
  // 珍珠链带（加密至 11 颗，奇偶起伏）
  const pearlXs = [29, 41, 53, 65, 77, 89, 101, 113, 125, 137, 148]
  const pearls = pearlXs.map((x, i) => ({
    x,
    y: +(arcY(x, 62, 5.5, 64) + (i % 2 ? 2.6 : 0)).toFixed(1),
  }))
  const scallopD = Array.from({ length: 9 }, (_, i) => {
    const x = 30 + i * 14
    return `M${x} ${arcY(x + 7, 90, 6, 66).toFixed(1)} a7 5.6 0 0 1 14 0`
  }).join(' ')
  // 中腹杏仁眼主纹带：7 只连续眼，瞳心金朱交替
  const eyeXs = [30, 49, 68, 87, 106, 125, 144]
  const eyes = eyeXs.map((x, i) => ({
    x,
    y: +arcY(x + 8, 120, 7, 66).toFixed(1),
    red: i % 2 === 0,
  }))
  const eyeD = eyes.map((e) => `M${e.x} ${e.y} q8 -7 16 0 q-8 7 -16 0`).join(' ')
  // 马赛克方块链：金块朱块交替
  const mosaics = Array.from({ length: 9 }, (_, i) => ({
    x: 36 + i * 13,
    y: +arcY(36 + i * 13, 150, 5, 64).toFixed(1),
    red: i % 2 === 1,
  }))
  const diamondD = Array.from({ length: 10 }, (_, i) => {
    const cx = 32 + i * 12 + 4.5
    const y = arcY(cx, 178, 5, 64).toFixed(1)
    return `M${cx - 4.5} ${y} l4.5 -4.5 l4.5 4.5 l-4.5 4.5 Z`
  }).join(' ')
  // 金线骨架（暗托/金漆/亮提三层共用）
  const frames = (
    <>
      <path d="M24 50 Q88 61 152 50" strokeDasharray="3 2" />
      <path d="M26 74 Q88 85 150 74" strokeDasharray="3 2" opacity="0.7" />
      <path d={scallopD} />
      {/* 主纹带上下双弧框 */}
      <path d="M28 104 Q88 115 148 104" />
      <path d="M30 162 Q88 173 146 162" />
      <path d={eyeD} />
      <path d={diamondD} opacity="0.85" />
      <path d="M36 196 Q88 206 140 196" strokeDasharray="3 2" />
      <path d="M39 244 Q88 254 137 244" strokeDasharray="3 2" opacity="0.7" />
    </>
  )
  return (
    <svg
      viewBox="0 0 176 300"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        {/* 深漆褐金柱身：暖褐金 → 深褐 → 沉黑（与签的暗金同色系） */}
        <linearGradient id="ft-ebony" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#432d16" />
          <stop offset="0.42" stopColor="#2a1a0b" />
          <stop offset="1" stopColor="#120b06" />
        </linearGradient>
        {/* 筒口深邃：内壁径向渐黑，带一线暖棕 */}
        <radialGradient id="ft-mouth-deep" cx="0.5" cy="0.1" r="1">
          <stop offset="0" stopColor="#000000" />
          <stop offset="0.75" stopColor="#030201" />
          <stop offset="1" stopColor="#160d06" />
        </radialGradient>
        <clipPath id="ft-body-clip">
          <path d="M18 30 A70 13 0 0 1 158 30 L154 46 L136 238 L142 262 A54 7 0 0 0 34 262 L40 238 L22 46 Z" />
        </clipPath>
        <filter id="ft-soften" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id="ft-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0"
          />
        </filter>
        {/* 金漆：斜向明暗变化的鎏金（提亮，与签身贴金箔呼应） */}
        <linearGradient id="ft-gpaint" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9a752a" />
          <stop offset="0.32" stopColor="#f4dd97" />
          <stop offset="0.58" stopColor="#c19944" />
          <stop offset="1" stopColor="#e6c66e" />
        </linearGradient>
        {/* 朱红漆：与签的朱红面板同色，斜向深浅 */}
        <linearGradient id="ft-cinnabar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7e2413" />
          <stop offset="0.5" stopColor="#c24626" />
          <stop offset="1" stopColor="#8f2a16" />
        </linearGradient>
        {/* 撇口在柱身上的落影 */}
        <linearGradient id="ft-flare-ao" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(0,0,0,0.55)" />
          <stop offset="1" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        {/* 两侧圆柱暗缘：左缘轻、右缘重 */}
        <linearGradient id="ft-side-ao" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(0,0,0,0.4)" />
          <stop offset="0.2" stopColor="rgba(0,0,0,0)" />
          <stop offset="0.66" stopColor="rgba(0,0,0,0.08)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.55)" />
        </linearGradient>
        {/* 足部接地沉暗 */}
        <linearGradient id="ft-foot-ao" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.38)" />
        </linearGradient>
      </defs>

      {/* 修长柱身：口沿微撇 → 八角柱收分 → 底座外撇 */}
      <path d="M18 30 A70 13 0 0 1 158 30 L154 46 L136 238 L142 262 A54 7 0 0 0 34 262 L40 238 L22 46 Z" fill="url(#ft-ebony)" />

      {/* 撇口段受光（暖光自上方偏左） */}
      <path d="M18 30 A70 13 0 0 0 88 43 L88 46 L22 46 Z" fill="rgba(255,224,168,0.12)" />
      <path d="M88 43 A70 13 0 0 0 158 30 L154 46 L88 46 Z" fill="rgba(0,0,0,0.3)" />
      {/* 八角柱五个受光面：右侧沉入阴影 */}
      <polygon points="22,46 51,46 61,238 40,238" fill="rgba(255,222,164,0.12)" />
      <polygon points="51,46 77.5,46 80.5,238 61,238" fill="rgba(255,226,172,0.18)" />
      <polygon points="77.5,46 98.5,46 95.5,238 80.5,238" fill="rgba(255,220,160,0.06)" />
      <polygon points="98.5,46 125,46 115,238 95.5,238" fill="rgba(0,0,0,0.28)" />
      <polygon points="125,46 154,46 136,238 115,238" fill="rgba(0,0,0,0.5)" />
      {/* 底座受光 */}
      <polygon points="40,238 88,238 88,262 34,262" fill="rgba(255,222,164,0.1)" />
      <polygon points="88,238 136,238 142,262 88,262" fill="rgba(0,0,0,0.4)" />

      {/* 摩挲得发亮的包浆微光（漆木柔光） */}
      <ellipse cx="56" cy="140" rx="9" ry="88" fill="rgba(255,232,184,0.08)" filter="url(#ft-soften)" />
      <ellipse cx="66" cy="110" rx="22" ry="42" fill="rgba(255,226,172,0.05)" filter="url(#ft-soften)" />

      {/* 哑光木理颗粒 */}
      <rect x="16" y="46" width="144" height="216" fill="#000" filter="url(#ft-grain)" opacity="0.42" />

      {/* 乌木纵纹：细微波浪木理 */}
      <g clipPath="url(#ft-body-clip)" fill="none" strokeLinecap="round">
        {[
          'M27 52 C26 110 28 180 27 236',
          'M36 50 C37 120 35 190 36 238',
          'M46 48 C45 115 47 185 46 238',
          'M58 48 C59 125 57 195 58 240',
          'M72 48 C71 120 73 190 72 240',
          'M88 47 C89 122 87 192 88 240',
          'M104 48 C103 124 105 194 104 240',
          'M118 48 C119 118 117 188 118 238',
          'M130 48 C129 112 131 182 130 237',
          'M141 49 C142 118 140 188 141 237',
          'M150 50 C149 115 151 185 150 235',
        ].map((d, i) => (
          <path key={i} d={d} stroke="rgba(0,0,0,0.3)" strokeWidth="0.45" opacity="0.55" />
        ))}
        {[
          'M52 49 C51 118 53 188 52 239',
          'M96 47 C97 123 95 193 96 240',
          'M136 48 C135 115 137 185 136 237',
        ].map((d, i) => (
          <path key={i} d={d} stroke="rgba(255,230,174,0.07)" strokeWidth="1.1" />
        ))}
      </g>

      {/* 金朱纹样已由 text_to_image 贴图替代，保留代码但隐藏 */}
      <g clipPath="url(#ft-body-clip)" opacity="0">
        {/* 暗托：每一笔先落一层深影，浮起于漆木面 */}
        <g
          transform="translate(0.6 0.8)"
          stroke="rgba(22,12,4,0.66)"
          fill="none"
          strokeWidth="0.85"
          strokeLinecap="round"
        >
          {frames}
          {pearls.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <circle r="5.4" />
              <circle r="3.6" />
            </g>
          ))}
          {waveClusters.map((c, i) => (
            <g key={i} transform={`translate(${c.cx} ${c.cy + (c.cx === 88 ? 4 : 2)})`}>
              {c.rs.map((r, j) => (
                <ellipse key={j} rx={r} ry={r * 0.9} />
              ))}
            </g>
          ))}
        </g>
        {/* 马赛克方块的落影 */}
        <g transform="translate(0.5 0.7)" fill="rgba(20,10,3,0.6)">
          {mosaics.map((m, i) => (
            <rect key={i} x={m.x - 2.3} y={m.y - 2.3} width="4.6" height="4.6" />
          ))}
        </g>
        {/* 朱红漆的暗托 */}
        <g
          transform="translate(0.5 0.65)"
          stroke="rgba(20,7,3,0.55)"
          fill="none"
          strokeWidth="1"
          strokeLinecap="round"
        >
          <path d="M25 53 Q88 64 151 53" />
          <path d="M29 107 Q88 118 147 107" />
          <path d="M31 159 Q88 170 145 159" />
          <path d="M40 248 Q88 257.5 136 248" />
        </g>

        {/* 金漆主体 */}
        <g stroke="url(#ft-gpaint)" fill="none" strokeWidth="0.6" strokeLinecap="round">
          {frames}
          {pearls.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <circle r="5.2" />
              <circle r="3.4" />
              <circle r="1.5" />
            </g>
          ))}
          {waveClusters.map((c, i) => (
            <g key={i} transform={`translate(${c.cx} ${c.cy + (c.cx === 88 ? 4 : 2)})`}>
              {c.rs.map((r, j) => (
                <ellipse key={j} rx={r} ry={r * 0.9} />
              ))}
            </g>
          ))}
        </g>
        {/* 马赛克金块（与朱块交替） */}
        <g fill="url(#ft-gpaint)">
          {mosaics
            .filter((m) => !m.red)
            .map((m, i) => (
              <rect key={i} x={m.x - 2.2} y={m.y - 2.2} width="4.4" height="4.4" />
            ))}
        </g>
        {/* 杏仁眼瞳心（金朱交替）+ 高光 */}
        <g>
          {eyes.map((e, i) => (
            <g key={i}>
              <circle cx={e.x + 8} cy={e.y} r="1.8" fill={e.red ? 'url(#ft-cinnabar)' : 'url(#ft-gpaint)'} />
              <circle cx={e.x + 7.4} cy={e.y - 0.6} r="0.5" fill="rgba(255,242,205,0.85)" />
            </g>
          ))}
        </g>

        {/* 朱红漆层：主纹带双框 · 口沿下与足部朱弦 · 朱色马赛克块 · 波纹簇心 */}
        <g stroke="url(#ft-cinnabar)" fill="none" strokeWidth="0.75" strokeLinecap="round">
          <path d="M25 53 Q88 64 151 53" opacity="0.4" />
          <path d="M29 107 Q88 118 147 107" opacity="0.6" />
          <path d="M31 159 Q88 170 145 159" opacity="0.6" />
          <path d="M40 248 Q88 257.5 136 248" opacity="0.55" />
        </g>
        <g fill="url(#ft-cinnabar)">
          {mosaics
            .filter((m) => m.red)
            .map((m, i) => (
              <rect key={i} x={m.x - 2.2} y={m.y - 2.2} width="4.4" height="4.4" />
            ))}
          {waveClusters.map((c, i) => (
            <circle key={i} cx={c.cx} cy={c.cy + (c.cx === 88 ? 4 : 2)} r="1.15" />
          ))}
        </g>

        {/* 亮提：受光侧一线细金芒 */}
        <g
          transform="translate(-0.3 -0.5)"
          stroke="rgba(255,243,205,0.45)"
          fill="none"
          strokeWidth="0.22"
          strokeLinecap="round"
          opacity="0.65"
        >
          {frames}
        </g>
        {/* 金漆小点：扇贝脊心与菱链心 */}
        <g fill="url(#ft-gpaint)" opacity="0.7">
          {Array.from({ length: 8 }, (_, i) => (
            <circle key={i} cx={37 + i * 14} cy={arcY(37 + i * 14, 84, 6, 66)} r="0.6" />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx={38 + i * 12} cy={arcY(38 + i * 12, 178, 5, 64)} r="0.55" />
          ))}
        </g>
        {/* 散点金星（加密） */}
        <g fill="url(#ft-gpaint)" opacity="0.6">
          <circle cx="42" cy="186" r="0.8" />
          <circle cx="70" cy="191" r="0.7" />
          <circle cx="106" cy="189" r="0.8" />
          <circle cx="134" cy="192" r="0.7" />
          <circle cx="36" cy="80" r="0.7" />
          <circle cx="140" cy="86" r="0.7" />
          <circle cx="60" cy="138" r="0.6" />
          <circle cx="118" cy="140" r="0.65" />
          <circle cx="46" cy="110" r="0.55" />
          <circle cx="130" cy="112" r="0.6" />
          <circle cx="88" cy="98" r="0.6" />
          <circle cx="88" cy="166" r="0.55" />
        </g>
      </g>

      {/* —— 柱身贴图：Klimt 风真实图片，盖住底层金朱纹样 —— */}
      {/* 加载前：底下 ft-ebony 渐变 + 金朱纹样正常显示；加载后：图片贴皮，光影罩层仍叠加保持筒形明暗 */}
      {/* 用 foreignObject + HTML img，比 SVG <image> 加载更可靠，能完整覆盖筒身区域 */}
      <foreignObject
        x="16"
        y="30"
        width="144"
        height="232"
        clipPath="url(#ft-body-clip)"
      >
        <img
          // eslint-disable-next-line @next/next/no-img-element
          src={TUBE_BODY_SRC}
          alt=""
          aria-hidden
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: 0.92,
          }}
        />
      </foreignObject>

      {/* —— 光影罩层：让纹样随筒面明暗起伏（「画在上面」的关键） —— */}
      <g clipPath="url(#ft-body-clip)">
        {/* 撇口外倾投下的落影 */}
        <rect x="16" y="46" width="144" height="18" fill="url(#ft-flare-ao)" />
        {/* 八角面转折（较底层淡一档，只让金线随面沉浮） */}
        <polygon points="22,46 51,46 61,238 40,238" fill="rgba(255,222,164,0.06)" />
        <polygon points="51,46 77.5,46 80.5,238 61,238" fill="rgba(255,224,168,0.09)" />
        <polygon points="77.5,46 98.5,46 95.5,238 80.5,238" fill="rgba(255,220,160,0.02)" />
        <polygon points="98.5,46 125,46 115,238 95.5,238" fill="rgba(0,0,0,0.2)" />
        <polygon points="125,46 154,46 136,238 115,238" fill="rgba(0,0,0,0.4)" />
        {/* 底座转折 */}
        <polygon points="40,238 88,238 88,262 34,262" fill="rgba(255,222,164,0.05)" />
        <polygon points="88,238 136,238 142,262 88,262" fill="rgba(0,0,0,0.32)" />
        {/* 两侧圆柱暗缘 + 足部接地沉暗 */}
        <rect x="16" y="30" width="144" height="234" fill="url(#ft-side-ao)" />
        <rect x="16" y="230" width="144" height="34" fill="url(#ft-foot-ao)" />
      </g>

      {/* 窄条镜面高光：受光棱内侧的两道竖光 */}
      <path d="M47 52 L57 236" stroke="rgba(255,232,176,0.08)" strokeWidth="4.5" fill="none" filter="url(#ft-soften)" />
      <path d="M67 50 L74 236" stroke="rgba(255,236,190,0.045)" strokeWidth="2.4" fill="none" filter="url(#ft-soften)" />
      {/* 环境紫晕：右轮廓一线冷反光（呼应场地紫光） */}
      <path d="M156.5 33 L152.5 47 L135 236" stroke="rgba(146,116,210,0.14)" strokeWidth="1.1" fill="none" filter="url(#ft-soften)" />

      {/* 棱线描金：磨掉大半，只剩断续痕迹（抖动时残金发亮） */}
      {[
        { d: 'M51 46 L61 238', dash: '12 26 7 34 18 30', o: 0.5 },
        { d: 'M77.5 46 L80.5 238', dash: '18 30 9 24 14 38', o: 0.42 },
        { d: 'M98.5 46 L95.5 238', dash: '9 28 15 22 8 36', o: 0.3 },
        { d: 'M125 46 L115 238', dash: '14 32 6 26 11 30', o: 0.22 },
      ].map((l, i) => (
        <g key={i}>
          <path d={l.d} stroke="rgba(0,0,0,0.4)" strokeWidth="0.9" fill="none" />
          <path
            d={l.d}
            stroke="#c9a452"
            strokeWidth="0.55"
            strokeDasharray={l.dash}
            opacity={l.o}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={l.d}
            className="ft-crack-glow"
            stroke="#e3cb8f"
            strokeWidth="0.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ))}
      {/* 两侧轮廓棱的残金 */}
      <path d="M18 30 L22 46 L40 238 L34 262" stroke="#d8b76a" strokeWidth="0.5" strokeDasharray="8 34 12 40" opacity="0.26" fill="none" />
      <path d="M158 30 L154 46 L136 238 L142 262" stroke="#d8b76a" strokeWidth="0.5" strokeDasharray="10 36 7 30" opacity="0.18" fill="none" />

      {/* 筒口：内里纯黑，沿口一线残金 */}
      <path d="M18 30 A70 13 0 0 1 158 30 Z" fill="url(#ft-mouth-deep)" />
      <path d="M18 30 A70 13 0 0 1 158 30" fill="none" stroke="#4d3924" strokeWidth="2.8" strokeLinecap="round" />
      <path
        d="M18 30 A70 13 0 0 1 158 30"
        fill="none"
        stroke="#d8b76a"
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeDasharray="15 22 8 30 11 24"
        opacity="0.62"
      />
      {/* 筒口前沿棱 */}
      <path d="M18 30 A70 13 0 0 0 158 30" fill="none" stroke="#120c08" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
      {/* 口沿下金线 / 底座旋纹（弧面车削痕，夹一道朱弦）/ 底沿 */}
      <path d="M22 46 L154 46" stroke="#d8b76a" strokeWidth="0.6" opacity="0.45" />
      <path d="M40 250.5 Q88 260 136 250.5" fill="none" stroke="rgba(255,228,172,0.16)" strokeWidth="1.7" />
      <path d="M40.5 251.8 Q88 261.3 135.5 251.8" fill="none" stroke="url(#ft-cinnabar)" strokeWidth="0.7" opacity="0.55" />
      <path d="M41 253 Q88 262.5 135 253" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="1.1" />
      <path d="M40 250.5 Q88 260 136 250.5" fill="none" stroke="#d8b76a" strokeWidth="0.5" opacity="0.5" />
      <path d="M34 262 A54 7 0 0 0 142 262" fill="none" stroke="#060403" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
      <path d="M34 262 A54 7 0 0 0 142 262" fill="none" stroke="#d8b76a" strokeWidth="0.5" strokeLinecap="round" strokeDasharray="12 26 8 22" opacity="0.38" />
    </svg>
  )
}

/* ======================== 签面 ======================== */

/** 签顶卷草纹饰（对称双卷 + 中瓣，极细金线） */
function StickOrnament() {
  return (
    <svg viewBox="0 0 40 16" className="ft-ornament" aria-hidden>
      <g fill="none" stroke="#a8863a" strokeWidth="0.6" strokeLinecap="round">
        <path d="M20 12 C17 12 15 10 15 7.5 C15 5.8 16.2 4.6 17.8 4.6 C19.2 4.6 20 5.6 20 7" />
        <path d="M20 12 C23 12 25 10 25 7.5 C25 5.8 23.8 4.6 22.2 4.6 C20.8 4.6 20 5.6 20 7" />
        <path d="M20 3 C21 4.5 21 6 20 7.5 C19 6 19 4.5 20 3 Z" />
        <path d="M4 14 C8 11.5 12 10.5 16 10.3" opacity="0.7" />
        <path d="M36 14 C32 11.5 28 10.5 24 10.3" opacity="0.7" />
      </g>
      <g fill="#a8863a">
        <circle cx="4" cy="14" r="0.8" />
        <circle cx="36" cy="14" r="0.8" />
        <circle cx="20" cy="1.8" r="0.7" />
      </g>
    </svg>
  )
}

function CharCols({ fortune, on }: { fortune: Fortune; on: boolean }) {
  const cols: { label: string; text: string; cls: string }[] = [
    { label: '宜', text: fortune.yi, cls: 'ft-label-yi' },
    { label: '忌', text: fortune.ji, cls: 'ft-label-ji' },
  ]
  let n = 0
  return (
    <div className={`ft-face ft-face-front ft-panel-behind ${on ? 'ft-chars-on' : ''}`}>
      {/* 签身贴图：Klimt 暗金木纹贴皮，叠在 .ft-face 木纹背景之上、签文/朱红面板之下 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={STICK_SKIN_SRC} className="ft-stick-skin" alt="" aria-hidden />
      <StickOrnament />
      {cols.map((c) => (
        <div className="ft-col" key={c.label}>
          {[c.label, ...Array.from(c.text)].map((ch) => {
            const i = n++
            return (
              <span
                key={i}
                className={`ft-char ${i === 0 ? c.cls : 'ft-text'}`}
                style={{ ['--d' as string]: `${i * 0.075}s` }}
              >
                {ch}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function EyeFace({ on, stage, blink }: { on: boolean; stage: number; blink: boolean }) {
  const gaze = stage === 3 ? 'left' : stage === 4 ? 'right' : ''
  return (
    <div className="ft-face ft-face-back">
      {/* 签身贴图：与正面同款 Klimt 暗金木纹贴皮 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={STICK_SKIN_SRC} className="ft-stick-skin" alt="" aria-hidden />
      <StickOrnament />
      <svg viewBox="0 0 80 44" className="w-[82%]" aria-hidden>
        <g className={`ft-eye-wrap ${on ? 'on' : ''}`}>
          <g className={`ft-eyelid ${blink ? 'blink' : ''}`}>
            {/* 眼眶（刻入暗金签身） */}
            <path
              d="M4 22 C18 3, 62 3, 76 22 C62 41, 18 41, 4 22 Z"
              fill="rgba(30,20,8,0.18)"
              stroke="#2e2314"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M12 13 C30 5, 50 5, 68 13"
              fill="none"
              stroke="#2e2314"
              strokeWidth="1.1"
              opacity="0.8"
            />
            {/* 虹膜 */}
            <circle cx="40" cy="22" r="9.5" fill="#6e5a38" stroke="#2e2314" strokeWidth="1.3" />
            <circle cx="40" cy="22" r="5.2" fill="#4a3b22" opacity="0.75" />
            {/* 瞳孔：扩大 → 左右移动 */}
            <g className={`ft-gaze ${gaze}`}>
              <circle className={`ft-pupil ${stage >= 2 ? 'big' : ''}`} cx="40" cy="22" r="4.4" fill="#140d06" />
              <circle cx="38.4" cy="20.4" r="1.1" fill="#d9c48e" opacity="0.85" />
            </g>
          </g>
        </g>
      </svg>
      <p className={`ft-watched ${on ? 'on' : ''}`}>它看见了</p>
    </div>
  )
}

/* ======================== 主组件 ======================== */

export default function FortuneAltar() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [fortune, setFortune] = useState<Fortune | null>(null)
  const [eyeStage, setEyeStage] = useState(0)
  const [blink, setBlink] = useState(false)
  const [charsOn, setCharsOn] = useState(false)
  const [shavings, setShavings] = useState(false)
  const [hint, setHint] = useState('')
  const [wall, setWall] = useState<Pinned[]>([])

  const timers = useRef<number[]>([])
  const lastId = useRef<string | null>(null)
  const reducedRef = useRef(false)

  useEffect(() => {
    reducedRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    try {
      const raw = localStorage.getItem(WALL_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setWall(parsed)
      }
    } catch {
      /* 它没看见（读档失败） */
    }
    return () => timers.current.forEach((id) => window.clearTimeout(id))
  }, [])

  const persist = (next: Pinned[]) => {
    try {
      localStorage.setItem(WALL_KEY, JSON.stringify(next))
    } catch {
      /* 墙满了 */
    }
  }

  const schedule = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const reset = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    setPhase('idle')
    setFortune(null)
    setEyeStage(0)
    setBlink(false)
    setCharsOn(false)
    setShavings(false)
  }

  const draw = () => {
    if (phase !== 'idle') return

    const pool = fortunes.filter((f) => f.id !== lastId.current)
    const picked = pool[Math.floor(Math.random() * pool.length)]
    lastId.current = picked.id
    setFortune(picked)

    if (reducedRef.current) {
      // 减弱动效：直接呈签
      setEyeStage(5)
      setCharsOn(true)
      setPhase('revealed')
      return
    }

    // —— 统一时间轴 ——
    setPhase('shaking')
    playFortuneShake()

    schedule(() => {
      setPhase('rising')
      setShavings(true)
    }, T_RISE)
    schedule(() => playWoodKnock(), T_KNOCK)
    schedule(() => {
      setPhase('poised') // 出筒后停顿 0.3s
    }, T_POISE)
    schedule(() => setPhase('back'), T_FLIP1)
    schedule(() => {
      setPhase('eye')
      setEyeStage(1)
      playFortuneEye()
    }, T_EYE)
    EYE_STEPS.slice(1).forEach((t, idx) => {
      schedule(() => setEyeStage(idx + 2), t)
    })
    schedule(() => setBlink(true), EYE_STEPS[5])
    schedule(() => setBlink(false), EYE_STEPS[5] + 340)
    schedule(() => setShavings(false), 4000)
    schedule(() => setPhase('fronting'), T_FLIP2)
    schedule(() => setCharsOn(true), T_CHARS)
    // 签文逐笔刻显时的刀刻声
    const totalChars = Array.from(picked.yi).length + Array.from(picked.ji).length + 2
    for (let i = 0; i < totalChars; i++) {
      schedule(() => playFortuneChar(), T_CHARS + i * 75)
    }
    schedule(() => setPhase('revealed'), T_REVEALED)
  }

  const putAway = () => {
    if (phase !== 'revealed') return
    setPhase('away')
    schedule(reset, T_AWAY)
  }

  const pinToWall = () => {
    if (phase !== 'revealed' || !fortune) return
    if (wall.some((w) => w.id === fortune.id)) {
      setHint('这支已经在墙上了，它盯了你很久。')
      window.setTimeout(() => setHint(''), 2600)
      return
    }
    playWoodKnock()
    const next = [{ ...fortune, pinnedAt: Date.now() }, ...wall]
    setWall(next)
    persist(next)
    setPhase('away')
    schedule(reset, T_AWAY)
  }

  const unpin = (pinnedAt: number) => {
    const next = wall.filter((x) => x.pinnedAt !== pinnedAt)
    setWall(next)
    persist(next)
  }

  type DebrisBit = {
    key: string
    kind: 'foil' | 'star'
    left: number
    w: number
    h: number
    drift: number
    spin: number
    dur: number
    delay: number
    fall: number
    v: number
  }

  // 鎏金箔片（厚重金属感）+ 星尘（四芒星闪烁），每次开抽刷新一批
  const debris = useMemo<DebrisBit[]>(() => {
    const foils: DebrisBit[] = Array.from({ length: 16 }, (_, i) => ({
      key: `f${i}`,
      kind: 'foil',
      left: (Math.random() - 0.5) * 46,
      w: 3 + Math.random() * 3.2,
      h: 2.2 + Math.random() * 2.4,
      drift: (Math.random() - 0.5) * 84,
      spin: 240 + Math.random() * 440,
      dur: 1.5 + Math.random() * 0.9,
      delay: Math.random() * 0.8,
      fall: 92 + Math.random() * 46,
      v: i % 3,
    }))
    const stars: DebrisBit[] = Array.from({ length: 11 }, (_, i) => ({
      key: `s${i}`,
      kind: 'star',
      left: (Math.random() - 0.5) * 54,
      w: 4.5 + Math.random() * 3.5,
      h: 0,
      drift: (Math.random() - 0.5) * 96,
      spin: 40 + Math.random() * 90,
      dur: 2 + Math.random() * 1,
      delay: Math.random() * 0.6,
      fall: 112 + Math.random() * 58,
      v: 0,
    }))
    return [...foils, ...stars]
    // 每次开抽刷新一批
  }, [phase === 'rising' || shavings]) // eslint-disable-line react-hooks/exhaustive-deps

  const risen = ['rising', 'poised', 'back', 'eye', 'fronting', 'revealed'].includes(phase)
  // 翻面及之后：签持在签筒前面（下移 + 放大 + 投影）
  const held = phase === 'back' || phase === 'eye' || phase === 'fronting' || phase === 'revealed'
  const ty = held ? TY_OUT : risen ? TY_UP : TY_HIDDEN
  const ry = phase === 'back' || phase === 'eye' ? 180 : 0
  const sc = held ? 1.45 : 1
  const haloLit = phase === 'back' || phase === 'eye' || phase === 'fronting'

  return (
    <div>
      {/* —— 仪式场 —— */}
      <div className="relative mx-auto h-[560px] w-full max-w-xl sm:h-[640px]">
        {/* 顶部紫光与底影 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(46% 40% at 50% 42%, rgba(124,92,191,0.16), transparent 70%), radial-gradient(60% 18% at 50% 96%, rgba(0,0,0,0.55), transparent 72%)',
          }}
        />

        {/* 签筒锚位：整体上移，为放大的签让出上方空间 */}
        <div
          className="absolute inset-x-0 bottom-0 flex justify-center"
          style={{ transform: 'translateY(-14px)' }}
        >
          <div
            role="button"
            tabIndex={phase === 'idle' ? 0 : -1}
            aria-label="摇动签筒，让命运抽你一下"
            data-no-click-sound
            onClick={draw}
            onKeyDown={(e) => {
              if (phase === 'idle' && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                draw()
              }
            }}
            className={`relative outline-none ${phase === 'idle' ? 'cursor-pointer' : ''}`}
            style={{
              width: 'clamp(140px, 43vw, 182px)',
              aspectRatio: '176 / 300',
            }}
          >
            <div className={`ft-rig relative h-full w-full ${phase === 'shaking' ? 'shaking' : ''}`}>
              <div className="absolute inset-0 z-10">
                <TubeBack />
              </div>

              {/* 被抽出的签（翻面后压到筒前，盖过筒身前景层） */}
              <div
                className={`pointer-events-none absolute left-1/2 ${held ? 'z-40' : 'z-20'}`}
                style={{
                  bottom: '90%',
                  width: 'clamp(26px, 8vw, 34px)',
                  aspectRatio: '1 / 6',
                  marginLeft: 'calc(clamp(26px, 8vw, 34px) / -2)',
                }}
              >
                {fortune && (
                  <div
                    className="ft-mover h-full w-full"
                    style={{
                      ['--ty' as string]: ty,
                      ['--ry' as string]: `${ry}deg`,
                      ['--sc' as string]: `${sc}`,
                      ['--td' as string]: TD[phase],
                    }}
                  >
                    <div
                      className={`ft-inner h-full w-full ${
                        phase === 'rising' ? 'rising' : phase === 'revealed' ? 'floating' : ''
                      }`}
                    >
                      <div className={`ft-halo ${haloLit ? 'lit' : ''}`} />
                      <CharCols fortune={fortune} on={charsOn} />
                      <EyeFace on={eyeStage >= 1} stage={eyeStage} blink={blink} />
                    </div>
                  </div>
                )}
              </div>

              <div className="absolute inset-0 z-30">
                <TubeFront />
              </div>

              {/* 签投在筒身上的影子 */}
              <div className={`ft-stick-shadow ${held ? 'on' : ''}`} />

              {/* 金箔屑与星尘 */}
              {shavings &&
                debris.map((p) =>
                  p.kind === 'star' ? (
                    <span
                      key={p.key}
                      className="ft-star z-40"
                      style={{
                        left: `calc(50% + ${p.left}px)`,
                        width: p.w,
                        height: p.w,
                        ['--drift' as string]: `${p.drift}px`,
                        ['--spin' as string]: `${p.spin}deg`,
                        ['--sd' as string]: `${p.dur}s`,
                        ['--sdelay' as string]: `${p.delay}s`,
                        ['--fall' as string]: `${p.fall}px`,
                      }}
                    />
                  ) : (
                    <span
                      key={p.key}
                      className={`ft-foil ft-foil-v${p.v} z-40`}
                      style={{
                        left: `calc(50% + ${p.left}px)`,
                        width: p.w,
                        height: p.h,
                        ['--drift' as string]: `${p.drift}px`,
                        ['--spin' as string]: `${p.spin}deg`,
                        ['--sd' as string]: `${p.dur}s`,
                        ['--sdelay' as string]: `${p.delay}s`,
                        ['--fall' as string]: `${p.fall}px`,
                      }}
                    />
                  ),
                )}
            </div>
          </div>
        </div>
      </div>

      {/* —— 提示 / 操作 —— */}
      <div className="mt-2 flex h-16 flex-col items-center gap-3">
        {phase === 'revealed' ? (
          <div className="flex items-center gap-5">
            <button
              type="button"
              data-no-click-sound
              onClick={pinToWall}
              className="rounded-sm border border-gold/60 px-5 py-2 text-[13px] tracking-[0.22em] text-gold-bright transition-colors hover:bg-gold/10"
            >
              钉在墙上
            </button>
            <button
              type="button"
              data-no-click-sound
              onClick={putAway}
              className="rounded-sm border border-gold/25 px-5 py-2 text-[13px] tracking-[0.22em] text-paper/70 transition-colors hover:border-gold/60 hover:text-paper"
            >
              收起来
            </button>
          </div>
        ) : phase === 'idle' ? (
          <p className="animate-pulse text-[13px] tracking-[0.34em] text-mute">
            点击签筒 · 让命运抽你一下
          </p>
        ) : (
          <p className="text-[13px] tracking-[0.5em] text-mute/70">···</p>
        )}
        {hint && <p className="text-xs tracking-[0.18em] text-gold/80">{hint}</p>}
      </div>

      {/* —— 墙上的签 —— */}
      {wall && wall.length > 0 && (
        <section className="mt-16">
          <div className="text-center">
            <p className="text-[11px] tracking-[0.5em] text-gold/60">NAILED ON THE WALL</p>
            <h2 className="mt-3 font-serif text-xl text-paper sm:text-2xl">钉在墙上的签</h2>
            <p className="mt-2 text-xs text-mute">它替你记着。想赖账，可以取下来。</p>
            <span className="klimt-rule mt-6" />
          </div>

          <div className="mt-10 flex flex-wrap items-start justify-center gap-x-8 gap-y-10">
            {wall.map((w, i) => {
              const rot =
                (Array.from(w.id).reduce((s, ch) => s + ch.charCodeAt(0), 0) + i * 41) % 7 - 3
              return (
                <div key={w.pinnedAt} className="flex flex-col items-center gap-3">
                  <div style={{ transform: `rotate(${rot}deg)` }} className="ft-pinned">
                    <div
                      className="ft-face ft-panel-behind relative flex items-start justify-center gap-[5px] px-[1px] pt-3"
                      style={{
                        position: 'relative',
                        width: 33,
                        height: 222,
                      }}
                    >
                      {/* 钉帽 */}
                      <span
                        className="absolute left-1/2 top-[3px] z-10 h-[7px] w-[7px] -translate-x-1/2 rounded-full"
                        style={{
                          background: 'radial-gradient(circle at 35% 30%, #f0d27e, #8a6a28)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.7)',
                        }}
                      />
                      <MiniCol label="宜" labelCls="ft-label-yi" text={w.yi} />
                      <MiniCol label="忌" labelCls="ft-label-ji" text={w.ji} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => unpin(w.pinnedAt)}
                    className="text-[11px] tracking-[0.25em] text-mute/60 transition-colors hover:text-gold-bright"
                  >
                    取下
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function MiniCol({ label, labelCls, text }: { label: string; labelCls: string; text: string }) {
  return (
    <div
      style={{
        writingMode: 'vertical-rl',
        fontFamily: '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif',
        fontSize: 9,
        letterSpacing: '0.06em',
        lineHeight: 1.05,
        whiteSpace: 'nowrap',
        color: '#1d150c',
        textShadow: '0 1px 0 rgba(255,232,180,0.32), 0 -1px 1px rgba(18,11,4,0.7)',
      }}
    >
      <span className={labelCls}>{label}</span>
      {Array.from(text).map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </div>
  )
}
