import fs from 'node:fs'
import path from 'node:path'

/**
 * 提问箱数据模型：
 * 游客提交的问题默认不公开（published=false、无 answer），
 * 只有站主在后台回答并公开后，才会出现在公开页面。
 */
export interface Question {
  id: string
  nickname: string
  text: string
  audio?: string
  createdAt: number
  /** 站主的回答；为空表示尚未回答 */
  answer?: string
  answeredAt?: number
  /** 是否公开展示（回答后默认公开，可下架） */
  published: boolean
}

/** 旧版留言板结构（用于数据迁移读取） */
interface LegacyReply {
  id: string
  nickname: string
  text: string
  createdAt: number
}
interface LegacyMessage {
  id: string
  nickname: string
  text: string
  audio?: string
  createdAt: number
  replies?: LegacyReply[]
}

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'messages.json')

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{"questions":[]}', 'utf-8')
}

/** 把旧版留言（含 replies）迁移成提问箱结构：有回复的取第一条回复作为回答并公开 */
function migrate(raw: unknown): Question[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>

  // 新结构
  if (Array.isArray(obj.questions)) {
    return (obj.questions as Question[]).filter((q) => q && q.id)
  }

  // 旧结构
  if (Array.isArray(obj.messages)) {
    return (obj.messages as LegacyMessage[]).filter((m) => m && m.id).map((m) => {
      const firstReply = m.replies && m.replies.length > 0 ? m.replies[0] : undefined
      return {
        id: m.id,
        nickname: m.nickname,
        text: m.text,
        audio: m.audio,
        createdAt: m.createdAt,
        answer: firstReply?.text,
        answeredAt: firstReply?.createdAt,
        published: Boolean(firstReply?.text),
      } satisfies Question
    })
  }

  return []
}

export function readMessages(): Question[] {
  ensureFile()
  try {
    const raw = fs.readFileSync(FILE, 'utf-8')
    return migrate(JSON.parse(raw))
  } catch {
    return []
  }
}

export function writeMessages(questions: Question[]) {
  ensureFile()
  fs.writeFileSync(FILE, JSON.stringify({ questions }, null, 2), 'utf-8')
}

/** 后台管理密钥：优先环境变量，否则用默认值（建议在 PM2 配置里覆盖） */
export function adminKey(): string {
  return process.env.ADMIN_KEY || 'sicksuck-admin'
}

/** 校验请求头里的管理密钥 */
export function isAuthorized(req: Request): boolean {
  const key = req.headers.get('x-admin-key') || ''
  // 恒定时间比较，避免时序泄露
  const expected = adminKey()
  if (key.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/** 随机匿名昵称：形容词 + 名词 */
const ADJ = ['迷路的', '夜行的', '失眠的', '沉默的', '漂浮的', '生锈的', '温柔的', '破碎的', '透明的', '饥饿的', '清醒的', '潮湿的', '遥远的', '迟钝的', '发光的']
const NOUN = ['鲸鱼', '月亮', '邮差', '影子', '乘客', '苔藓', '回音', '潮汐', '萤火虫', '阁楼', '钟摆', '旅人', '乌鸦', '水母', '烟囱']

export function randomNickname(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]
  return `${a}${n}`
}
