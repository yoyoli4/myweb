import type { Metadata } from 'next'
import { notes } from '@/data/content'
import { formatDate } from '@/lib/date'

export const metadata: Metadata = {
  title: '关卡',
}

/**
 * 关卡卡片边框纹理（克里姆特金紫黑花纹，已下载到本地）
 * 用 CSS mask 让图片中间透明，只显示边框框。
 */
const BORDER_SRC = '/images/ai/note-border.jpg'

export default function NotesPage() {
  // 按时间倒序
  const sorted = [...notes].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <main className="mx-auto w-full max-w-xl px-6 pb-28 pt-28 sm:pt-32">
      <header className="fade-rise">
        <p className="text-[11px] tracking-[0.5em] text-gold/70">LEVELS CLEARED</p>
        <h1 className="mt-4 font-serif text-3xl text-paper sm:text-4xl">关卡</h1>
        <p className="mt-3 text-sm text-mute">
          BOSS根本打不完，嘻嘻。
        </p>
        <span className="klimt-rule mt-7" />
      </header>

      <div className="mt-14 space-y-6">
        {sorted.map((note, i) => (
          <section
            key={note.id}
            className="note-card fade-rise relative overflow-hidden rounded-2xl bg-ink-700/50 p-6 sm:p-7"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {/* 克里姆特金紫黑花纹边框：text_to_image 生成，CSS mask 中空只显示边框 */}
            {/* 用 div + background-image（非 <img>）：img 的 padding 会让图片缩进 content-box，padding 区域无图，mask 后整个看不到；div 的 background 填满 padding 区域 */}
            <div
              className="klimt-border-img pointer-events-none absolute inset-0 h-full w-full"
              style={{ backgroundImage: `url(${BORDER_SRC})` }}
              aria-hidden
            />
            {/* 加载前/真图下的金线描边兜底 */}
            <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-[rgba(227,203,143,0.3)]" aria-hidden />
            <time className="relative text-[11px] tracking-[0.3em] text-gold/80">
              {formatDate(note.date)}
            </time>
            <p className="relative mt-3 text-[15px] leading-[1.95] text-[#D2CAE3]">
              {note.text}
            </p>
            {note.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={note.image}
                alt=""
                loading="lazy"
                className="relative mt-5 w-full rounded-xl border border-white/5 object-cover"
              />
            )}
          </section>
        ))}
      </div>
    </main>
  )
}
