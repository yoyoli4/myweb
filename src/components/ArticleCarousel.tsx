'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Article } from '@/data/content'
import { formatDate } from '@/lib/date'

interface Props {
  articles: Article[]
}

// 首尾各克隆几张，让第一张左边也有卡片（无限循环）
const PADS = 2

export default function ArticleCarousel({ articles }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const n = articles.length
  // [尾部克隆 ×PADS, 原始卡片, 头部克隆 ×PADS]
  const loop = [...articles.slice(n - PADS), ...articles, ...articles.slice(0, PADS)]
  const [active, setActive] = useState(PADS)

  const findBest = () => {
    const el = scrollerRef.current
    if (!el) return 0
    const center = el.scrollLeft + el.clientWidth / 2
    let best = 0
    let bestDist = Infinity
    el.querySelectorAll<HTMLElement>('[data-card]').forEach((it, i) => {
      const c = it.offsetLeft + it.offsetWidth / 2
      const d = Math.abs(c - center)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    return best
  }

  const scrollToIndex = (j: number, smooth: boolean) => {
    const el = scrollerRef.current
    if (!el) return
    const it = el.querySelectorAll<HTMLElement>('[data-card]')[j]
    if (!it) return
    const target = it.offsetLeft + it.offsetWidth / 2 - el.clientWidth / 2
    if (!smooth) el.style.scrollBehavior = 'auto'
    el.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' })
    if (!smooth) requestAnimationFrame(() => (el.style.scrollBehavior = ''))
  }

  // 滚动停止后，若停在克隆卡上，无感跳回对应的真实卡
  const normalize = () => {
    const best = findBest()
    if (best < PADS) {
      scrollToIndex(best + n, false)
      setActive(best + n)
    } else if (best >= PADS + n) {
      scrollToIndex(best - n, false)
      setActive(best - n)
    }
  }

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let raf = 0
    let settle = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setActive(findBest()))
      window.clearTimeout(settle)
      settle = window.setTimeout(normalize, 180)
    }
    const onSettle = () => {
      window.clearTimeout(settle)
      normalize()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // 支持 scrollend 的浏览器以它为准（拖拽中停顿不会误跳）
    el.addEventListener('scrollend', onSettle)
    // 初始定位到第一张真实卡（瞬时，无动画）
    scrollToIndex(PADS, false)
    setActive(PADS)
    const onResize = () => {
      const best = findBest()
      const real = best < PADS ? best + n : best >= PADS + n ? best - n : best
      scrollToIndex(real, false)
      setActive(real)
    }
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', onSettle)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(settle)
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  const scrollToCard = (i: number) => scrollToIndex(i + PADS, true)

  // 指示器的真实下标（克隆位置也映射回 0..n-1）
  const dotActive = (((active - PADS) % n) + n) % n

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory items-center overflow-x-auto scroll-smooth pb-10 [scrollbar-width:none] [perspective:1400px] [&::-webkit-scrollbar]:hidden"
        style={{ scrollPadding: '0 50%' }}
      >
        <div className="shrink-0 basis-1/2" aria-hidden />
        {loop.map((a, j) => {
          const offset = j - active
          const abs = Math.abs(offset)
          const isActive = offset === 0
          // 立体环绕：越偏离中心，绕 Y 轴旋转越多，并缩小、淡出
          const rotY = offset * -22
          const scale = 1 - abs * 0.12
          const opacity = isActive ? 1 : Math.max(0.2, 1 - abs * 0.55)
          const z = 10 - abs

          return (
            <div
              key={`${a.slug}-${j}`}
              data-card
              className="snap-center shrink-0 px-3"
              style={{ width: 'min(78vw, 420px)' }}
            >
              <div
                className="group relative cursor-pointer [transform-style:preserve-3d] transition-transform duration-500 ease-out"
                style={{
                  transform: `rotateY(${rotY}deg) scale(${scale})`,
                  opacity,
                  zIndex: z,
                }}
              >
                <Link
                  href={`/articles/${a.slug}`}
                  onClick={(e) => {
                    if (isActive) return
                    e.preventDefault()
                    scrollToIndex(j, true)
                  }}
                  tabIndex={isActive ? 0 : -1}
                  aria-label={a.title}
                  aria-hidden={!isActive}
                  className="block overflow-hidden rounded-2xl border border-gold/20 bg-ink/40 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
                >
                  <div className="relative aspect-[3/2] w-full overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.cover}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
                  </div>
                  <div className="p-5">
                    <time className="text-[11px] tracking-[0.3em] text-mute">
                      {formatDate(a.date)}
                    </time>
                    <h3 className="mt-2 font-serif text-xl text-paper transition-colors group-hover:text-gold-bright sm:text-2xl">
                      {a.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-mute/90">
                      {a.excerpt}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-2 text-xs tracking-[0.25em] text-gold/80 transition-all group-hover:gap-3 group-hover:text-gold-bright">
                      回看剧情 <span aria-hidden>→</span>
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          )
        })}
        <div className="shrink-0 basis-1/2" aria-hidden />
      </div>

      {/* 指示器 */}
      <div className="mt-4 flex justify-center gap-2">
        {articles.map((a, i) => (
          <button
            key={a.slug}
            onClick={() => scrollToCard(i)}
            aria-label={`第 ${i + 1} 张`}
            className={`h-1.5 rounded-full transition-all ${
              i === dotActive ? 'w-6 bg-gold' : 'w-1.5 bg-gold/30 hover:bg-gold/60'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
