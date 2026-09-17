'use client'

import { useEffect, useRef, useState } from 'react'
import { paintings } from '@/data/content'
import type { Painting } from '@/data/content'
import { formatDate } from '@/lib/date'
import { playCardHover } from '@/lib/sound'
import Lightbox from './Lightbox'

/**
 * 马桶里的画廊：一副牌背朝下的塔罗牌。
 * 保持扇形牌阵，牌多时横向拖动牌轴浏览；凭直觉抽一张 → 牌面翻开，画作才肯露面。
 */

/**
 * 唯一牌背（剧情同款：text_to_image 生成的克里姆特金紫黑油画风图片）
 * 接口为异步生成，首次进入浏览器需等约 20–40s 才出真图，期间显示金紫底占位。
 * 文字「SICK · SUCK · WORLD」用 SVG 叠加在图片上，不依赖 AI 拼写（AI 容易把 SICK 写成 KICK）。
 */
const CARD_BACK_SRC = '/images/ai/card-back.jpg'

function CardBack() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-gradient-to-b from-[#241636] via-[#140d1e] to-[#0a0710]">
      {/* 占位金箔纹理：真图加载前给一点克里姆特味道 */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(closest-side, rgba(212,175,100,0.18), transparent 70%), repeating-linear-gradient(45deg, rgba(201,169,97,0.08) 0 6px, transparent 6px 14px)',
        }}
        aria-hidden
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CARD_BACK_SRC}
        alt="SICK SUCK WORLD 牌背"
        loading="lazy"
        className="relative h-full w-full object-cover"
      />
      {/* SVG 叠加文字：金填充 + 深描边，任何背景上都清晰；paintOrder 让描边在填充下 */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 200 320"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <text
          x="100"
          y="38"
          textAnchor="middle"
          fontFamily="'Cinzel','Trajan Pro','Noto Serif SC',serif"
          fontSize="11"
          letterSpacing="3.5"
          fill="#f4dd92"
          stroke="#0a0710"
          strokeWidth="2.8"
          paintOrder="stroke"
          fontWeight="700"
        >
          SICK · SUCK · WORLD
        </text>
      </svg>
      {/* 顶部金边描线，强化"牌"的边界 */}
      <div className="pointer-events-none absolute inset-0 rounded-[14px] ring-1 ring-[#c9a452]/60" aria-hidden />
      <div className="pointer-events-none absolute inset-[3px] rounded-[11px] ring-[0.5px] ring-[#e3cb8f]/40" aria-hidden />
    </div>
  )
}

/** 牌的正面：画作 */
function CardFace({ painting }: { painting: Painting }) {
  return (
    <div className="tarot-face flex h-full w-full flex-col overflow-hidden rounded-[13px] border-2 border-[#b98f3a] bg-[#160f26] shadow-[inset_0_0_0_1px_rgba(244,221,146,0.5)]">
      <div className="relative mx-2 mt-2 overflow-hidden rounded-md border border-gold/40 sm:mx-2.5 sm:mt-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={painting.image}
          alt={painting.title}
          loading="lazy"
          className="aspect-[4/5] w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_18px_rgba(0,0,0,0.55)]" />
      </div>
      <div className="flex flex-1 flex-col px-2.5 pb-2 pt-1.5 text-center sm:px-3 sm:pb-2.5">
        <h2 className="font-serif text-[10px] leading-tight text-gold-bright sm:text-[13px]">
          《{painting.title}》
        </h2>
        <p className="mt-0.5 text-[6.5px] tracking-[0.18em] text-mute sm:text-[9px]">
          {formatDate(painting.date)}
          {painting.medium ? ` · ${painting.medium}` : ''}
        </p>
        {painting.note && (
          <p className="mt-1 hidden text-[9px] italic leading-[1.5] text-[#b9aed4] sm:block">
            {painting.note}
          </p>
        )}
      </div>
    </div>
  )
}

export default function PaintingGallery() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [hasScrolled, setHasScrolled] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // 拖拽滚动状态
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 })

  // 新到旧
  const sorted = [...paintings].sort((a, b) => (a.date < b.date ? 1 : -1))
  const images = sorted.map((p) => p.image)
  const n = sorted.length
  const c = (n - 1) / 2

  // 抽中的牌归正后必定停在扇形中心，所以把牌轴滚到中点即可（与归正动画同时进行）
  const centerFan = () => {
    const sc = scrollerRef.current
    if (!sc) return
    sc.scrollTo({
      left: (sc.scrollWidth - sc.clientWidth) / 2,
      behavior: 'smooth',
    })
  }

  // 首屏居中：入场券遮罩可能让组件初始尺寸为 0，用 ResizeObserver 等到首次获得真实宽度
  useEffect(() => {
    const sc = scrollerRef.current
    if (!sc) return
    const toMid = () => {
      sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(toMid))
    let inited = false
    const ro = new ResizeObserver(() => {
      if (!inited && sc.clientWidth > 0) {
        inited = true
        toMid()
      }
    })
    ro.observe(sc)
    if (sc.clientWidth > 0) inited = true
    const onResize = () => {
      sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const draw = (id: string) => {
    if (drag.current.moved) return // 拖拽结束的松手不抽牌
    setSelectedId(id)
    centerFan()
  }

  /* —— 鼠标/触摸拖拽牌轴 —— */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const sc = scrollerRef.current
    if (!sc) return
    // 注意：不能用 setPointerCapture，它会把 pointerup 重定向到 scroller，
    // 导致 button 收不到 pointerup，进而 click 不触发，抽牌失败。
    drag.current = { active: true, moved: false, startX: e.clientX, startLeft: sc.scrollLeft }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return
    const sc = scrollerRef.current
    if (!sc) return
    const dx = e.clientX - drag.current.startX
    if (Math.abs(dx) > 6) {
      drag.current.moved = true
      setHasScrolled(true)
    }
    sc.scrollLeft = drag.current.startLeft - dx
  }
  const endDrag = () => {
    if (!drag.current.active) return
    drag.current.active = false
    // 不在此处重置 moved；交给下次 pointerdown 重置，
    // 这样拖拽结束后 click 仍能正确读到 moved=true 而拒绝抽牌。
  }

  return (
    <>
      {/* 牌阵：扇形 + 横向滑动轴，整体上挪 2cm */}
      <div className="tarot-stage relative left-1/2 mt-10 w-screen -translate-x-1/2 -translate-y-[2cm] select-none sm:mt-14">
        <div
          ref={scrollerRef}
          className="tarot-scroller"
          onScroll={(e) => {
            const mid = (e.currentTarget.scrollWidth - e.currentTarget.clientWidth) / 2
            if (Math.abs(e.currentTarget.scrollLeft - mid) > 10) setHasScrolled(true)
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
        >
          <div
            className="tarot-fan"
            style={{ '--n': n, '--c': c } as React.CSSProperties}
          >
            {sorted.map((p, i) => {
              const isDrawn = selectedId === p.id
              const isRest = selectedId !== null && !isDrawn
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => !isDrawn && draw(p.id)}
                  onMouseEnter={() => !isDrawn && playCardHover()}
                  aria-label={`抽出第 ${i + 1} 张牌`}
                  className={`tarot-card group h-[186px] w-[116px] cursor-pointer outline-none sm:h-[328px] sm:w-[205px] ${
                    isDrawn ? 'is-drawn' : ''
                  } ${isRest ? 'is-rest' : ''}`}
                  style={
                    {
                      zIndex: isDrawn ? 30 : i + 1,
                      animationDelay: `${i * 80}ms`,
                      '--i': i,
                      '--an': Math.abs(i - c),
                    } as React.CSSProperties
                  }
                >
                  <div className="tarot-inner relative h-full w-full">
                    {/* 牌背 */}
                    <div className="tarot-face tarot-back absolute inset-0 overflow-hidden rounded-[14px] bg-[#f6f3ea] shadow-[0_18px_40px_rgba(0,0,0,0.65)] ring-1 ring-black/70 transition-[filter] duration-300 group-hover:[filter:brightness(1.04)]">
                      <CardBack />
                    </div>
                    {/* 牌面 */}
                    <div className="tarot-face tarot-front absolute inset-0 shadow-[0_26px_60px_rgba(0,0,0,0.75),0_0_30px_rgba(201,169,97,0.28)]">
                      <CardFace painting={p} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        {/* 滑动提示：离开初始位置后淡出 */}
        <p
          className={`tarot-swipe-hint pointer-events-none absolute inset-x-0 -bottom-7 text-center text-[10px] tracking-[0.35em] text-mute/70 transition-opacity duration-700 sm:-bottom-9 sm:text-xs ${
            hasScrolled ? 'opacity-0' : 'opacity-100'
          }`}
          aria-hidden
        >
          ← 拖动牌轴 · 凭直觉抽一张 →
        </p>
      </div>

      {/* 提示 / 操作 */}
      <div className="mt-12 flex h-10 items-center justify-center sm:mt-14">
        {selectedId === null ? (
          <p className="tarot-hint text-[11px] leading-relaxed text-center tracking-[0.18em] text-mute sm:text-base">
            你掉的是这把金斧头，还是这把银斧头？
          </p>
        ) : (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                const idx = sorted.findIndex((p) => p.id === selectedId)
                setLightbox(idx)
              }}
              className="rounded-full border border-gold/40 px-5 py-1.5 text-xs tracking-[0.25em] text-gold-bright transition-colors hover:border-gold hover:bg-gold/10 sm:text-sm"
            >
              仔细看看
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null)
                centerFan()
              }}
              className="rounded-full border border-wisteria/40 px-5 py-1.5 text-xs tracking-[0.25em] text-wisteria transition-colors hover:border-wisteria hover:bg-wisteria/10 sm:text-sm"
            >
              收回牌阵
            </button>
          </div>
        )}
      </div>

      {lightbox !== null && (
        <Lightbox
          photos={images}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      )}
    </>
  )
}
