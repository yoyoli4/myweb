import type { Metadata } from 'next'
import MessageBoard from '@/components/MessageBoard'

export const metadata: Metadata = {
  title: '提问箱',
  description: '把奇怪的问题丢进箱子——文字或语音都可以，匿名。我会挑一些回答，回答后才会公开展示。',
}

export default function InteractPage() {
  return (
    <main className="pt-28 pb-24">
      <section className="mx-auto max-w-3xl px-4 text-center">
        <h1 className="font-serif text-3xl tracking-[0.18em] text-gold-bright sm:text-4xl">提 问 箱</h1>
        <div className="klimt-rule mx-auto my-5" />
        <p className="mx-auto max-w-md text-sm leading-relaxed text-mute">
          把问题丢进来，匿名的。
          <br />
          只有我能看见，挑一些回答之后，才会展示在下面。
        </p>
      </section>

      <div className="mt-12">
        <MessageBoard />
      </div>
    </main>
  )
}
