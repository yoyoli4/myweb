'use client'

import { useEffect, useState } from 'react'
import { ambientMusic, TRACKS, type MusicState } from '@/lib/music'

/**
 * 全局黑胶唱机：右下角浮动唱片按钮，点击展开唱机面板。
 * - 唱片旋转 = 播放中；暂停/未启动时停转
 * - 可在三首曲目间交叉淡入淡出切换
 */
function Disc({ size, spinning }: { size: number; spinning: boolean }) {
  return (
    <div
      className={`relative shrink-0 rounded-full bg-[#0b0712] shadow-[0_6px_24px_rgba(0,0,0,0.55)] ring-1 ring-[#c9a961]/30 ${spinning ? 'vinyl-spin' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* 唱片沟槽 */}
      <div className="absolute inset-[6%] rounded-full border border-[#211833]" />
      <div className="absolute inset-[12%] rounded-full border border-[#1a1328]" />
      <div className="absolute inset-[19%] rounded-full border border-[#241b38]" />
      <div className="absolute inset-[27%] rounded-full border border-[#1a1328]" />
      {/* 反光斜弧 */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'conic-gradient(from 210deg, transparent 0deg, rgba(227,203,143,0.10) 24deg, transparent 52deg, transparent 360deg)' }}
      />
      {/* 金色中心签 */}
      <div className="absolute inset-0 m-auto flex h-[34%] w-[34%] items-center justify-center rounded-full bg-gradient-to-br from-[#f0dd9f] via-[#c9a961] to-[#8a6d32]">
        <div className="h-[16%] w-[16%] rounded-full bg-[#0b0712] ring-1 ring-black/40" />
      </div>
    </div>
  )
}

export default function VinylPlayer() {
  const [state, setState] = useState<MusicState>({ started: false, paused: false, cur: 0, count: TRACKS.length })
  const [open, setOpen] = useState(false)

  useEffect(() => ambientMusic.subscribe(setState), [])

  const spinning = state.started && !state.paused
  const track = TRACKS[state.cur]

  const onPlayPause = () => {
    if (!state.started) {
      void ambientMusic.start().catch(() => {})
    } else {
      void ambientMusic.togglePause()
    }
  }

  return (
    <>
      {/* 浮动唱片按钮 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="唱片台"
        className="fixed bottom-[max(1.1rem,env(safe-area-inset-bottom))] right-4 z-[900] flex h-12 w-12 items-center justify-center rounded-full bg-[#120c1e]/85 ring-1 ring-[#c9a961]/35 backdrop-blur-sm transition-transform hover:scale-105 sm:right-6 sm:h-14 sm:w-14"
      >
        <Disc size={36} spinning={spinning} />
        {state.started && !state.paused && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#e3cb8f] shadow-[0_0_8px_rgba(227,203,143,0.9)]" />
        )}
      </button>

      {/* 唱机面板 */}
      {open && (
        <div
          className="fixed bottom-[max(4.6rem,calc(env(safe-area-inset-bottom)+3.6rem))] right-4 z-[900] w-[min(86vw,320px)] rounded-2xl border border-[#c9a961]/25 bg-[#140d20]/95 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.65)] backdrop-blur-md sm:right-6"
          role="dialog"
          aria-label="唱机"
        >
          <div className="flex items-start gap-4">
            <Disc size={88} spinning={spinning} />
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[10px] tracking-[0.35em] text-[#a99cc4]">NOW PLAYING</p>
              <h3 className="mt-1.5 truncate font-serif text-base leading-snug text-[#f4ecdb]">{track.name}</h3>
              <p className="mt-1 truncate text-xs text-[#b8acd4]">{track.sub}</p>
              <p className="mt-2 text-[11px] text-[#8f84a8]">
                {state.started ? (state.paused ? '已暂停' : '旋转中') : '尚未开机'} · {state.cur + 1} / {state.count}
              </p>
            </div>
          </div>

          {/* 控制钮 */}
          <div className="mt-5 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => ambientMusic.prev()}
              aria-label="上一首"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#d9c98f] transition-colors hover:bg-[#c9a961]/12"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM20 6v12L9 12z" /></svg>
            </button>
            <button
              type="button"
              onClick={onPlayPause}
              aria-label={spinning ? '暂停' : '播放'}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#f0dd9f] to-[#b8923f] text-[#1a1020] shadow-[0_4px_16px_rgba(201,169,97,0.35)] transition-transform hover:scale-105"
            >
              {spinning ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => ambientMusic.next()}
              aria-label="下一首"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#d9c98f] transition-colors hover:bg-[#c9a961]/12"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 6l11 6-11 6z" /></svg>
            </button>
          </div>

          {/* 曲目点 */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {TRACKS.map((t, i) => (
              <button
                key={t.src}
                type="button"
                onClick={() => {
                  if (i !== state.cur) {
                    if (i === (state.cur + 1) % state.count) ambientMusic.next()
                    else if (i === (state.cur - 1 + state.count) % state.count) ambientMusic.prev()
                  }
                }}
                aria-label={t.name}
                className={`h-1.5 rounded-full transition-all ${i === state.cur ? 'w-6 bg-[#e3cb8f]' : 'w-1.5 bg-[#5a4f74] hover:bg-[#8f84a8]'}`}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
