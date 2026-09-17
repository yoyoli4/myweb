'use client'

import { useEffect, useRef, useState } from 'react'
import type { Message } from '@/lib/messages'

type VoiceMode = 'normal' | 'deep' | 'chipmunk'

/** 将 AudioBuffer 编码为 16-bit PCM WAV Blob */
function encodeWav(buffer: AudioBuffer): Blob {
  const ch = 1
  const sr = buffer.sampleRate
  const len = buffer.length
  const ab = new ArrayBuffer(44 + len * 2)
  const view = new DataView(ab)
  const ws = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i))
  }
  ws(0, 'RIFF')
  view.setUint32(4, 36 + len * 2, true)
  ws(8, 'WAVE')
  ws(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, ch, true)
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ws(36, 'data')
  view.setUint32(40, len * 2, true)
  const data = buffer.getChannelData(0)
  let off = 44
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    off += 2
  }
  return new Blob([ab], { type: 'audio/wav' })
}

/** 录音后通过 OfflineAudioContext 变速变调 */
async function pitchShiftBlob(blob: Blob, rate: number): Promise<Blob> {
  const ab = await blob.arrayBuffer()
  const tmp = new (window.AudioContext || (window as any).webkitAudioContext)()
  const decoded = await tmp.decodeAudioData(ab)
  const off = new OfflineAudioContext(1, Math.ceil(decoded.length / rate), decoded.sampleRate)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.playbackRate.value = rate
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  tmp.close()
  return encodeWav(rendered)
}

export default function MessageBoard() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [blink, setBlink] = useState(false)
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioData, setAudioData] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('normal')
  const [processing, setProcessing] = useState(false)
  // 静态托管（无服务端 /api）时，留言接口不可用，优雅降级不崩页
  const [apiOffline, setApiOffline] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const load = async () => {
    try {
      const res = await fetch('/api/messages')
      if (!res.ok) throw new Error('bad status')
      const data = await res.json()
      setMessages(data.messages ?? [])
      setApiOffline(false)
    } catch {
      // 静态托管无后端：留言板离线，页面其余部分正常
      setMessages([])
      setApiOffline(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const triggerBlink = () => {
    setBlink(true)
    setTimeout(() => setBlink(false), 360)
  }

  const openComposer = () => {
    triggerBlink()
    setComposerOpen((v) => !v)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        let blob = rawBlob
        if (voiceMode !== 'normal') {
          setProcessing(true)
          try {
            const rate = voiceMode === 'deep' ? 0.72 : 1.5
            blob = await pitchShiftBlob(rawBlob, rate)
          } catch {
            /* 变声失败，回退原声 */
          }
          setProcessing(false)
        }
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        const reader = new FileReader()
        reader.onload = () => setAudioData(reader.result as string)
        reader.readAsDataURL(blob)
        stream.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
      // 最长 30 秒
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') stopRecording()
      }, 30000)
    } catch {
      alert('无法访问麦克风，请检查浏览器权限。')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  const discardAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setAudioData(null)
  }

  const submit = async () => {
    if ((!text.trim() && !audioData) || submitting) return
    if (apiOffline) {
      alert('当前为静态页面，留言功能需要服务端支持，暂不可用。')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), audio: audioData ?? undefined }),
      })
      if (!res.ok) throw new Error('post failed')
      setText('')
      discardAudio()
      setComposerOpen(false)
      load()
    } catch {
      alert('留言发送失败，服务暂不可用。')
    } finally {
      setSubmitting(false)
    }
  }

  const submitReply = async (id: string) => {
    if (!replyText.trim()) return
    if (apiOffline) return
    try {
      const res = await fetch(`/api/messages/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      })
      if (!res.ok) throw new Error('reply failed')
      setReplyText('')
      setReplyTo(null)
      load()
    } catch {
      alert('回复发送失败，服务暂不可用。')
    }
  }

  const fmt = (t: number) =>
    new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="mx-auto max-w-3xl px-4">
      {/* 眼睛留言按钮 */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={openComposer}
          aria-label="留言"
          className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-gold/40 bg-ink/60 transition-colors hover:border-gold"
        >
          {/* 眼睛 SVG：眨眼时整体垂直压扁，模拟眼皮闭合 */}
          <svg
            viewBox="0 0 64 40"
            className={`h-8 w-12 text-gold-bright ${blink ? 'eye-blink' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M4 20 C16 6, 48 6, 60 20 C48 34, 16 34, 4 20 Z" />
            <circle cx="32" cy="20" r="7" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <span className="mt-2 text-xs tracking-[0.3em] text-mute">留 言</span>
      </div>

      {/* 留言输入区 */}
      <div
        className={`grid transition-all duration-500 ${
          composerOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-6 rounded-2xl border border-gold/20 bg-ink/50 p-4 sm:p-6">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="写下你想说的……"
              className="h-24 w-full resize-none rounded-lg border border-gold/15 bg-ink/40 p-3 text-sm text-paper outline-none placeholder:text-mute/60 focus:border-gold/50"
            />

            {/* 音频 */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* 变声器 */}
              {!audioUrl && !recording && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] tracking-[0.15em] text-mute/70">变声</span>
                  {([['normal', '原声'], ['deep', '低沉'], ['chipmunk', '花栗鼠']] as [VoiceMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setVoiceMode(mode)}
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] tracking-wide transition-colors ${
                        voiceMode === mode
                          ? 'border-gold/70 text-gold-bright bg-gold/10'
                          : 'border-gold/15 text-mute/60 hover:text-paper'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {processing && (
                <span className="text-[11px] text-gold/70 animate-pulse">变声处理中…</span>
              )}

              {!audioUrl && !processing ? (
                recording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex items-center gap-2 rounded-full border border-red-400/50 px-4 py-1.5 text-xs text-red-300"
                  >
                    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    录音中…点击停止
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="rounded-full border border-gold/40 px-4 py-1.5 text-xs text-gold-bright hover:bg-gold/10"
                  >
                    按住/点击录一段语音
                  </button>
                )
              ) : (
                <div className="flex items-center gap-3">
                  <audio src={audioUrl ?? undefined} controls className="h-8" />
                  <button
                    type="button"
                    onClick={discardAudio}
                    className="text-xs text-mute underline hover:text-paper"
                  >
                    重录
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={submitting || (!text.trim() && !audioData)}
                className="ml-auto rounded-full border border-gold px-6 py-1.5 text-xs tracking-[0.2em] text-gold-bright transition-colors hover:bg-gold/10 disabled:opacity-40"
              >
                发 送
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 留言列表 */}
      <div className="mt-10 space-y-4">
        {loading && <p className="text-center text-sm text-mute">正在翻阅留言……</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-mute">
            {apiOffline ? '留言板需要服务端支持，当前静态页面暂不可用。' : '还没有人留下痕迹，成为第一个吧。'}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="rounded-xl border border-gold/15 bg-ink/40 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-gold-bright">{m.nickname}</span>
              <span className="text-[11px] text-mute/70">{fmt(m.createdAt)}</span>
            </div>
            {m.text && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-paper/90">{m.text}</p>}
            {m.audio && (
              <audio src={m.audio} controls className="mt-3 h-8 w-full max-w-md" />
            )}

            {/* 回复区 */}
            {m.replies.length > 0 && (
              <div className="mt-3 space-y-2 border-l border-gold/15 pl-3">
                {m.replies.map((r) => (
                  <div key={r.id} className="text-xs">
                    <span className="text-gold/80">{r.nickname}</span>
                    <span className="ml-2 text-mute/60">{fmt(r.createdAt)}</span>
                    <p className="mt-0.5 text-paper/80">{r.text}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3">
              {replyTo === m.id ? (
                <div className="flex gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="回复这条留言……"
                    className="flex-1 rounded-md border border-gold/15 bg-ink/40 px-3 py-1.5 text-xs text-paper outline-none focus:border-gold/50"
                    autoFocus
                  />
                  <button
                    onClick={() => submitReply(m.id)}
                    className="rounded-md border border-gold/50 px-3 text-xs text-gold-bright hover:bg-gold/10"
                  >
                    回
                  </button>
                  <button
                    onClick={() => {
                      setReplyTo(null)
                      setReplyText('')
                    }}
                    className="rounded-md px-2 text-xs text-mute hover:text-paper"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setReplyTo(m.id)}
                  className="text-xs text-mute hover:text-gold-bright"
                >
                  ↳ 回复
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
