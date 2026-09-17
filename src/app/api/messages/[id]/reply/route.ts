import { NextRequest, NextResponse } from 'next/server'
import { readMessages, writeMessages, randomNickname } from '@/lib/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await req.json()
    const text = String(body.text ?? '').trim()
    if (!text) {
      return NextResponse.json({ error: '回复不能为空' }, { status: 400 })
    }
    const all = readMessages()
    const target = all.find((m) => m.id === id)
    if (!target) {
      return NextResponse.json({ error: '留言不存在' }, { status: 404 })
    }
    target.replies.push({
      id: crypto.randomUUID(),
      nickname: randomNickname(),
      text,
      createdAt: Date.now(),
    })
    writeMessages(all)
    return NextResponse.json({ replies: target.replies })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
