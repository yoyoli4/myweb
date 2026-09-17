'use client'

import { useCallback, useEffect } from 'react'

interface LightboxProps {
  photos: string[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export default function Lightbox({ photos, index, onClose, onNavigate }: LightboxProps) {
  const total = photos.length

  const go = useCallback(
    (next: number) => {
      onNavigate((next + total) % total)
    },
    [onNavigate, total],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(index - 1)
      if (e.key === 'ArrowRight') go(index + 1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [index, go, onClose])

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/92 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 顶栏：序号 + 关闭 */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-sm text-mute sm:px-8">
        <span className="tracking-[0.3em]">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 text-gold-bright transition-colors hover:border-gold hover:bg-gold/10"
        >
          ✕
        </button>
      </div>

      {/* 照片本体 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={photos[index]}
        src={photos[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="fade-rise max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-[0_30px_90px_rgba(0,0,0,0.8)]"
      />

      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={(e) => {
              e.stopPropagation()
              go(index - 1)
            }}
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gold/30 bg-ink/60 text-xl text-gold-bright backdrop-blur transition-colors hover:border-gold hover:bg-gold/10 sm:left-8"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={(e) => {
              e.stopPropagation()
              go(index + 1)
            }}
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gold/30 bg-ink/60 text-xl text-gold-bright backdrop-blur transition-colors hover:border-gold hover:bg-gold/10 sm:right-8"
          >
            ›
          </button>
        </>
      )}
    </div>
  )
}
