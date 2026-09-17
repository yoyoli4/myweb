import type { Metadata } from 'next'
import FortuneAltar from '@/components/FortuneAltar'

export const metadata: Metadata = {
  title: '命运抽了下你',
}

export default function FatePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-28 pt-28 sm:px-8 sm:pt-32">
      <header className="fade-rise">
        <p className="text-[11px] tracking-[0.5em] text-gold/70">FATE DRAWS YOU</p>
        <h1 className="mt-4 font-serif text-3xl text-paper sm:text-4xl">命运抽了下你</h1>
        <p className="mt-3 text-sm text-mute">
          你以为是你在抽签。其实是签，也在抽你。
        </p>
        <span className="klimt-rule mt-7" />
      </header>

      <FortuneAltar />
    </main>
  )
}
