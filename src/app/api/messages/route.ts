import { NextRequest, NextResponse } from 'next/server'
import { readMessages, writeMessages, randomNickname, type Question } from '@/lib/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 公开接口：只返回「已回答且已公开」的问题（按回答时间倒序） */
export async function GET() {
  const questions = readMessages()
    .filter((q) => q.published && q.answer && q.answer.trim())
    .sort((a, b) => (b.answeredAt ?? b.createdAt) - (a.answeredAt ?? a.createdAt))
  return NextResponse.json({ questions })
}

/** 游客提交问题：默认不公开、无回答，仅站主后台可见 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const text = String(body.text ?? '').trim()
    const audio = typeof body.audio === 'string' ? body.audio.slice(0, 4_000_000) : undefined
    if (!text && !audio) {
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 })
    }
    const question: Question = {
      id: crypto.randomUUID(),
      nickname: randomNickname(),
      text,
      audio,
      createdAt: Date.now(),
      published: false,
    }
    const all = readMessages()
    all.push(question)
    writeMessages(all)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
