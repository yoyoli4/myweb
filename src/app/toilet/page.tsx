import type { Metadata } from 'next'
import PaintingGallery from '@/components/PaintingGallery'

export const metadata: Metadata = {
  title: '马桶里',
}

export default function ToiletPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-28 pt-28 sm:px-8 sm:pt-32">
      <header className="fade-rise">
        <p className="text-[11px] tracking-[0.5em] text-gold/70">THE TOILET</p>
        <h1 className="mt-4 font-serif text-3xl text-paper sm:text-4xl">马桶里</h1>
        <p className="mt-3 text-sm text-mute">
          灵感都掉进了马桶，冲水之前，先捞了回来。
        </p>
        <span className="klimt-rule mt-7" />
      </header>

      <PaintingGallery />
    </main>
  )
}
