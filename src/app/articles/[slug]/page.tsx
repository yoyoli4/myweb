import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { articles } from '@/data/content'
import { formatDate } from '@/lib/date'

interface PageProps {
  params: { slug: string }
}

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }))
}

export function generateMetadata({ params }: PageProps): Metadata {
  const article = articles.find((a) => a.slug === params.slug)
  return article ? { title: article.title } : {}
}

export default function ArticlePage({ params }: PageProps) {
  const article = articles.find((a) => a.slug === params.slug)
  if (!article) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pb-32 pt-28 sm:pt-32">
      <Link
        href="/articles"
        className="text-xs tracking-[0.25em] text-mute transition-colors hover:text-gold-bright"
      >
        ← 返回剧情列表
      </Link>

      <header className="fade-rise mt-10 text-center">
        <time className="text-[11px] tracking-[0.35em] text-mute">
          {formatDate(article.date)}
        </time>
        <h1 className="mt-5 font-serif text-3xl leading-snug text-paper sm:text-[40px]">
          {article.title}
        </h1>
        <div className="mx-auto mt-6 h-px w-12 bg-gold/50" />
      </header>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={article.cover}
        alt=""
        className="fade-rise mt-10 w-full rounded-xl border border-white/5 object-cover"
        style={{ animationDelay: '120ms' }}
      />

      <article
        className="fade-rise mt-12 space-y-7"
        style={{ animationDelay: '200ms' }}
      >
        {article.blocks.map((block, i) => {
          if (block.type === 'h2') {
            return (
              <h2
                key={i}
                className="pt-6 font-serif text-xl text-gold-bright"
              >
                {block.text}
              </h2>
            )
          }
          if (block.type === 'quote') {
            return (
              <blockquote
                key={i}
                className="border-l-2 border-gold/60 pl-5 font-serif text-[17px] italic leading-9 text-[#C3B8DE]"
              >
                {block.text}
              </blockquote>
            )
          }
          if (block.type === 'image') {
            return (
              <figure key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.src}
                  alt={block.alt ?? ''}
                  loading="lazy"
                  className="w-full rounded-xl border border-white/5"
                />
              </figure>
            )
          }
          return (
            <p
              key={i}
              className="text-[16px] leading-[2.15] tracking-[0.02em] text-[#D2CAE3]"
            >
              {block.text}
            </p>
          )
        })}
      </article>

      <div className="mt-16 text-center">
        <Link
          href="/articles"
          className="inline-block rounded-full border border-gold/30 px-7 py-2.5 text-xs tracking-[0.3em] text-gold-bright transition-colors hover:border-gold hover:bg-gold/10"
        >
          返回剧情列表
        </Link>
      </div>
    </main>
  )
}
