'use client'

import dynamic from 'next/dynamic'
import { places } from '@/data/content'

const WorldMap = dynamic(() => import('@/components/WorldMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-5 bg-ink">
      <div className="map-pin" style={{ width: 34, height: 34 }}>
        <span className="ring" />
        <span className="dot" />
      </div>
      <p className="text-xs tracking-[0.5em] text-mute">正在点亮地图…</p>
    </div>
  ),
})

export default function HomePage() {
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-ink">
      <WorldMap />

      {/* 左下角标题区 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-12 sm:pb-12">
        <p className="text-[10px] tracking-[0.5em] text-gold/70 sm:text-[11px]">
          SICK SUCK WORLD
        </p>
        <h1 className="mt-3 font-serif text-3xl text-[#F3EAD6] sm:text-5xl">
          呕心小世界
        </h1>
        <p className="mt-2 text-xs text-mute sm:text-sm">
          凡我呕过之处，皆为疆土 · 已占领 {places.length} 处
        </p>
      </div>
    </main>
  )
}
