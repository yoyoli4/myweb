'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Question } from '@/lib/messages'

const KEY_STORE = 'ssw-admin-key'

type Tab = 'pending' | 'answered'

export default function AdminPage() {
  const [key, setKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [tab, setTab] = useState<Tab>('pending')
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORE)
    if (saved) {
      setKey(saved)
      void load(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const headers = useCallback(
    (k: string) => ({ 'Content-Type': 'application/json', 'x-admin-key': k }),
    [],
  )

  const load = async (k: string) => {
    setLoading(true)
    setAuthError(false)
    try {
      const res = await fetch('/api/messages/admin', { headers: { 'x-admin-key': k } })
      if (res.status === 401) {
        setAuthed(false)
        setAuthError(true)
        localStorage.removeItem(KEY_STORE)
        return
      }
      if (!res.ok) throw new Error('bad')
      const data = await res.json()
      setQuestions(data.questions ?? [])
      setAuthed(true)
      localStorage.setItem(KEY_STORE, k)
    } catch {
      setAuthError(true)
    } finally {
      setLoading(false)
    }
  }

  const login = () => {
    if (key.trim()) void load(key.trim())
  }

  const refresh = () => load(key)

  const answer = async (id: string) => {
    const text = (answerDrafts[id] ?? '').trim()
    if (!text) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/messages/${id}/answer`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({ answer: text }),
      })
      if (!res.ok) throw new Error()
      setAnswerDrafts((d) => ({ ...d, [id]: '' }))
      await refresh()
    } catch {
      alert('回答失败')
    } finally {
      setBusyId(null)
    }
  }

  const toggle = async (q: Question) => {
    setBusyId(q.id)
    try {
      const res = await fetch(`/api/messages/${q.id}`, {
        method: 'PATCH',
        headers: headers(key),
        body: JSON.stringify({ published: !q.published }),
      })
      if (!res.ok) throw new Error()
      await refresh()
    } catch {
      alert('操作失败')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('确定删除这条问题？不可恢复。')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'DELETE',
        headers: headers(key),
      })
      if (!res.ok) throw new Error()
      await refresh()
    } catch {
      alert('删除失败')
    } finally {
      setBusyId(null)
    }
  }

  const fmt = (t: number) =>
    new Date(t).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })

  const pending = questions.filter((q) => !q.answer)
  const answered = questions.filter((q) => q.answer)

  /* ---------- 密钥门 ---------- */
  if (!authed) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-gold/20 bg-ink/50 p-7">
          <h1 className="text-center font-serif text-xl tracking-[0.2em] text-gold-bright">提问箱后台</h1>
          <div className="klimt-rule mx-auto my-5" />
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setAuthError(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="管理密钥"
            autoFocus
            className="w-full rounded-lg border border-gold/20 bg-ink/60 px-4 py-2.5 text-sm text-paper outline-none placeholder:text-mute/50 focus:border-gold/60"
          />
          {authError && <p className="mt-2 text-xs text-red-300/90">密钥不对，或服务暂不可用。</p>}
          <button
            onClick={login}
            disabled={loading}
            className="mt-4 w-full rounded-full border border-gold py-2 text-sm tracking-[0.25em] text-gold-bright transition-colors hover:bg-gold/10 disabled:opacity-50"
          >
            {loading ? '验证中…' : '进 入'}
          </button>
          <p className="mt-5 text-center">
            <Link href="/interact" className="text-xs text-mute underline-offset-2 hover:text-paper hover:underline">
              ← 返回提问箱
            </Link>
          </p>
        </div>
      </main>
    )
  }

  /* ---------- 管理面板 ---------- */
  const list = tab === 'pending' ? pending : answered

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-10">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-2xl tracking-[0.15em] text-gold-bright">提问箱后台</h1>
        <div className="flex items-center gap-4 text-xs">
          <Link href="/interact" className="text-mute hover:text-paper">查看公开页</Link>
          <button
            onClick={() => {
              localStorage.removeItem(KEY_STORE)
              setAuthed(false)
              setKey('')
            }}
            className="text-mute hover:text-red-300"
          >
            退出
          </button>
        </div>
      </header>

      {/* 统计 + 标签 */}
      <div className="mt-6 flex items-center gap-2">
        {([['pending', `待回答 (${pending.length})`], ['answered', `已回答 (${answered.length})`]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-xs tracking-wide transition-colors ${
              tab === t
                ? 'border-gold/70 bg-gold/10 text-gold-bright'
                : 'border-gold/15 text-mute/70 hover:text-paper'
            }`}
          >
            {label}
          </button>
        ))}
        <button onClick={refresh} className="ml-auto text-xs text-mute hover:text-gold-bright">
          刷新
        </button>
      </div>

      {/* 列表 */}
      <div className="mt-6 space-y-4">
        {loading && <p className="py-10 text-center text-sm text-mute">加载中…</p>}
        {!loading && list.length === 0 && (
          <p className="py-10 text-center text-sm text-mute">
            {tab === 'pending' ? '没有待回答的问题，箱子是空的。' : '还没有回答过问题。'}
          </p>
        )}

        {list.map((q) => (
          <div key={q.id} className="rounded-xl border border-gold/15 bg-ink/40 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] tracking-[0.15em] text-mute/70">{q.nickname}</span>
              <span className="text-[11px] text-mute/50">{fmt(q.createdAt)}</span>
            </div>

            {q.text && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-paper/90">{q.text}</p>
            )}
            {q.audio && <audio src={q.audio} controls className="mt-3 h-8 w-full max-w-md" />}

            {/* 待回答：回答框 */}
            {!q.answer && (
              <div className="mt-3">
                <textarea
                  value={answerDrafts[q.id] ?? ''}
                  onChange={(e) => setAnswerDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                  placeholder="写下回答，提交后自动公开…"
                  className="h-20 w-full resize-none rounded-lg border border-gold/15 bg-ink/50 p-3 text-sm text-paper outline-none placeholder:text-mute/50 focus:border-gold/50"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => remove(q.id)}
                    disabled={busyId === q.id}
                    className="rounded-full border border-red-400/30 px-4 py-1 text-xs text-red-300/80 hover:bg-red-400/10 disabled:opacity-40"
                  >
                    删除
                  </button>
                  <button
                    onClick={() => answer(q.id)}
                    disabled={busyId === q.id || !(answerDrafts[q.id] ?? '').trim()}
                    className="rounded-full border border-gold px-5 py-1 text-xs tracking-[0.15em] text-gold-bright hover:bg-gold/10 disabled:opacity-40"
                  >
                    回答并公开
                  </button>
                </div>
              </div>
            )}

            {/* 已回答：展示回答 + 上下架/删除 */}
            {q.answer && (
              <>
                <div className="mt-3 rounded-lg border border-gold/10 bg-gold/[0.04] p-3">
                  <span className="text-[11px] tracking-[0.2em] text-gold/80">我的回答</span>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#e8dfd0]">{q.answer}</p>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <span className={`mr-auto text-[11px] ${q.published ? 'text-emerald-300/80' : 'text-mute/60'}`}>
                    {q.published ? '● 公开展示中' : '○ 已下架'}
                  </span>
                  <button
                    onClick={() => toggle(q)}
                    disabled={busyId === q.id}
                    className="rounded-full border border-gold/30 px-4 py-1 text-xs text-gold-bright/90 hover:bg-gold/10 disabled:opacity-40"
                  >
                    {q.published ? '下架' : '重新公开'}
                  </button>
                  <button
                    onClick={() => remove(q.id)}
                    disabled={busyId === q.id}
                    className="rounded-full border border-red-400/30 px-4 py-1 text-xs text-red-300/80 hover:bg-red-400/10 disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
