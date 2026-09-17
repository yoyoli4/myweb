import { NextRequest, NextResponse } from 'next/server'
import { readMessages, writeMessages, randomNickname, type Message } from '@/lib/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const messages = readMessages().sort((a, b) => b.createdAt - a.createdAt)
  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const text = String(body.text ?? '').trim()
    const audio = typeof body.audio === 'string' ? body.audio.slice(0, 4_000_000) : undefined
    if (!text && !audio) {
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 })
    }
    const message: Message = {
      id: crypto.randomUUID(),
      nickname: randomNickname(),
      text,
      audio,
      createdAt: Date.now(),
      replies: [],
    }
    const all = readMessages()
    all.push(message)
    writeMessages(all)
    return NextResponse.json({ message })
  } catch (e) {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
