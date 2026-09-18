import { NextRequest, NextResponse } from 'next/server'
import { readMessages, writeMessages, isAuthorized } from '@/lib/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 站主回答问题：写入 answer 并默认公开 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  try {
    const body = await req.json()
    const answer = String(body.answer ?? '').trim()
    if (!answer) {
      return NextResponse.json({ error: '回答不能为空' }, { status: 400 })
    }
    const all = readMessages()
    const target = all.find((q) => q.id === id)
    if (!target) {
      return NextResponse.json({ error: '问题不存在' }, { status: 404 })
    }
    target.answer = answer
    target.answeredAt = Date.now()
    target.published = true
    writeMessages(all)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
