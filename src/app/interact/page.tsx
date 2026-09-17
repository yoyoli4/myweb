import type { Metadata } from 'next'
import MessageBoard from '@/components/MessageBoard'

export const metadata: Metadata = {
  title: '互动',
  description: '在这里给我留言——文字或语音都可以，所有人都是匿名的过客。',
}

export default function InteractPage() {
  return (
    <main className="pt-28 pb-24">
      <section className="mx-auto max-w-3xl px-4 text-center">
        <h1 className="font-serif text-3xl tracking-[0.18em] text-gold-bright sm:text-4xl">互 动</h1>
        <div className="klimt-rule mx-auto my-5" />
        <p className="mx-auto max-w-md text-sm leading-relaxed text-mute">
          有些奇怪的想法和疑问，
          <br />
          或许可以在这里找到答案。
        </p>
      </section>

      <div className="mt-12">
        <MessageBoard />
      </div>
    </main>
  )
}
