import fs from 'node:fs'
import path from 'node:path'

export interface Reply {
  id: string
  nickname: string
  text: string
  createdAt: number
}

export interface Message {
  id: string
  nickname: string
  text: string
  audio?: string
  createdAt: number
  replies: Reply[]
}

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'messages.json')

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{"messages":[]}', 'utf-8')
}

export function readMessages(): Message[] {
  ensureFile()
  try {
    const raw = fs.readFileSync(FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.messages) ? data.messages : []
  } catch {
    return []
  }
}

export function writeMessages(messages: Message[]) {
  ensureFile()
  fs.writeFileSync(FILE, JSON.stringify({ messages }, null, 2), 'utf-8')
}

/** 随机匿名昵称：形容词 + 名词 */
const ADJ = ['迷路的', '夜行的', '失眠的', '沉默的', '漂浮的', '生锈的', '温柔的', '破碎的', '透明的', '饥饿的', '清醒的', '潮湿的', '遥远的', '迟钝的', '发光的']
const NOUN = ['鲸鱼', '月亮', '邮差', '影子', '乘客', '苔藓', '回音', '潮汐', '萤火虫', '阁楼', '钟摆', '旅人', '乌鸦', '水母', '烟囱']

export function randomNickname(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]
  return `${a}${n}`
}
