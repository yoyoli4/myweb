import { NextResponse } from 'next/server'
import { readMessages, isAuthorized } from '@/lib/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 后台接口：返回全部问题（含未回答/未公开），需管理密钥 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const questions = readMessages().sort((a, b) => b.createdAt - a.createdAt)
  return NextResponse.json({ questions })
}
