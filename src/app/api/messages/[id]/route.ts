import { NextRequest, NextResponse } from 'next/server'
import { readMessages, writeMessages, isAuthorized } from '@/lib/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 切换公开/下架状态（需管理密钥） */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const all = readMessages()
    const target = all.find((q) => q.id === id)
    if (!target) {
      return NextResponse.json({ error: '问题不存在' }, { status: 404 })
    }
    // 显式传 published 就用传入值，否则切换当前状态
    target.published = typeof body.published === 'boolean' ? body.published : !target.published
    writeMessages(all)
    return NextResponse.json({ ok: true, published: target.published })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}

/** 删除问题（需管理密钥） */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(_req)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const all = readMessages()
  const next = all.filter((q) => q.id !== id)
  if (next.length === all.length) {
    return NextResponse.json({ error: '问题不存在' }, { status: 404 })
  }
  writeMessages(next)
  return NextResponse.json({ ok: true })
}
