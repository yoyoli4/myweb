import type { Metadata } from 'next'
import { articles } from '@/data/content'
import ArticleCarousel from '@/components/ArticleCarousel'

export const metadata: Metadata = {
  title: '剧情',
}

export default function ArticlesPage() {
  return (
    <main className="w-full pb-28 pt-28 sm:pt-32">
      <header className="mx-auto max-w-4xl px-6 text-center sm:px-8">
        <p className="fade-rise text-[11px] tracking-[0.5em] text-gold/70">PLOT ARCHIVE</p>
        <h1 className="fade-rise mt-4 font-serif text-3xl text-paper sm:text-4xl">剧情</h1>
        <p className="fade-rise mt-3 text-sm text-mute">
          完了这个也不是正确选项，我要读档重开...
        </p>
        <span className="klimt-rule mx-auto mt-7" />
      </header>

      <div className="mt-12">
        <ArticleCarousel articles={articles} />
      </div>
    </main>
  )
}
