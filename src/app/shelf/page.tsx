import type { Metadata } from 'next'
import { shelf, type ShelfItem } from '@/data/content'

export const metadata: Metadata = {
  title: '陈列架',
  description: '房间一角：正在读的书、看的片、循环的歌。',
}

/** 无封面时的纯排版封面：用标题首字 + 金色纹理做一张小卡 */
function TypeCover({ title, seed }: { title: string; seed: string }) {
  const ch = title.trim().charAt(0) || '·'
  // 每个条目稳定的深色底（不随机闪烁）
  const hues = ['#1c1430', '#221734', '#1a1226', '#241a38']
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const bg = hues[h % hues.length]
  return (
    <div
      className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg ring-1 ring-[#c9a961]/25"
      style={{ background: `radial-gradient(120% 90% at 50% 0%, rgba(201,169,97,0.14), transparent 55%), ${bg}` }}
    >
      <span className="select-none font-serif text-5xl text-[#e3cb8f]/85">{ch}</span>
      <span className="absolute inset-x-3 top-3 h-px bg-gradient-to-r from-transparent via-[#c9a961]/50 to-transparent" />
      <span className="absolute inset-x-3 bottom-3 h-px bg-gradient-to-r from-transparent via-[#c9a961]/50 to-transparent" />
    </div>
  )
}

function Card({ item, index }: { item: ShelfItem; index: number }) {
  return (
    <article
      className="fade-rise flex flex-col rounded-xl border border-[#c9a961]/14 bg-[#140d20]/70 p-3.5 transition-colors hover:border-[#c9a961]/35"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="relative">
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover} alt={item.title} loading="lazy" className="aspect-[3/4] w-full rounded-lg object-cover ring-1 ring-[#c9a961]/25" />
        ) : (
          <TypeCover title={item.title} seed={item.title + item.creator} />
        )}
        {item.tag && (
          <span className="absolute left-2 top-2 rounded-full border border-[#c9a961]/40 bg-[#0d0817]/85 px-2 py-0.5 text-[10px] tracking-[0.15em] text-[#e3cb8f]">
            {item.tag}
          </span>
        )}
      </div>
      <h3 className="mt-3 font-serif text-[15px] leading-snug text-[#f4ecdb]">{item.title}</h3>
      <p className="mt-1 text-xs tracking-wide text-[#b3a6cf]">{item.creator}</p>
      {item.note && (
        <p className="mt-2 text-[13px] leading-relaxed text-[#cfc5de]">{item.note}</p>
      )}
    </article>
  )
}

function Section({
  index, en, title, items,
}: {
  index: string
  en: string
  title: string
  items: ShelfItem[]
}) {
  return (
    <section className="mt-14 first:mt-0">
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-sm text-[#8a7443]">{index}</span>
        <h2 className="font-serif text-2xl text-[#f4ecdb]">{title}</h2>
        <span className="ml-1 text-[10px] tracking-[0.35em] text-[#7d7299]">{en}</span>
        <span className="ml-auto text-xs text-[#7d7299]">{items.length}</span>
      </div>
      <span className="klimt-rule mt-4 opacity-60" style={{ width: '100%', maxWidth: '100%' }} />
      <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((it, i) => (
          <Card key={it.title} item={it} index={i} />
        ))}
      </div>
    </section>
  )
}

export default function ShelfPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 pb-28 pt-28 sm:pt-32">
      <header className="fade-rise">
        <p className="text-[11px] tracking-[0.5em] text-[#a89864]">THE CORNER SHELF</p>
        <h1 className="mt-4 font-serif text-3xl text-[#f4ecdb] sm:text-4xl">陈列架</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[#a89dbf]">
          房间一角的三层架子，随手摆的。
          <br />
          读一半的书、没看的片、循环到死的歌——它们比我更像我。
        </p>
        <span className="klimt-rule mt-7" />
      </header>

      <Section index="壹" en="BOOKS" title="书架" items={shelf.books} />
      <Section index="贰" en="FILMS" title="片架" items={shelf.films} />
      <Section index="叁" en="RECORDS" title="唱片架" items={shelf.music} />
    </main>
  )
}
