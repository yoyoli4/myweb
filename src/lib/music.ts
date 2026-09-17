/**
 * 背景音乐：三首真实曲目循环播放，共享同一个主控音量（音量同步），
 * 曲目间做柔和交叉淡入淡出，避免硬切。
 *
 * 曲目来自用户提供的音频（已放入 public/music/）：
 *  - ophelia-dream.mp3  （奥菲利亚的梦 - 梦）
 *  - dance-for-me-wallis.mp3（Abel Korzeniowski - Dance for Me Wallis）
 *  - tiandi-huanhuan.flac（闻神 - 天地缓缓 古琴版）
 */

const TRACKS = [
  { src: '/music/ophelia-dream.mp3', name: 'Ophelia Dream' },
  { src: '/music/dance-for-me-wallis.mp3', name: 'Dance for Me Wallis' },
  { src: '/music/tiandi-huanhuan.flac', name: '天地缓缓（古琴版）' },
]

export class AmbientMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private elements: HTMLAudioElement[] = []
  private sources: MediaElementAudioSourceNode[] = []
  private gains: GainNode[] = []
  private cur = 0
  private playing = false
  private checkTimer: number | null = null
  private readonly crossfade = 4.5 // 秒

  async start() {
    if (this.playing) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    const ctx = this.ctx
    await ctx.resume()

    // 共享主控音量：两首曲目都从这里出，天然音量同步
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    this.master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 2)

    TRACKS.forEach((t, i) => {
      const el = new Audio(t.src)
      el.crossOrigin = 'anonymous'
      el.preload = 'auto'
      el.loop = false
      el.volume = 1
      const src = ctx.createMediaElementSource(el)
      const g = ctx.createGain()
      g.gain.value = i === 0 ? 1 : 0 // 第一首满音量，第二首 0
      src.connect(g)
      g.connect(this.master!)
      this.elements.push(el)
      this.sources.push(src)
      this.gains.push(g)
    })

    this.playing = true
    this.cur = 0
    await this.elements[0].play().catch(() => {})
    this.scheduleLoop()
  }

  private scheduleLoop = () => {
    if (!this.playing || !this.ctx) return
    const now = this.ctx.currentTime
    const cur = this.elements[this.cur]
    const nextIdx = (this.cur + 1) % TRACKS.length
    const next = this.elements[nextIdx]

    if (cur.duration && isFinite(cur.duration)) {
      const remain = cur.duration - cur.currentTime
      // 剩 crossfade 秒时启动下一首并交叉淡入淡出
      if (remain <= this.crossfade + 0.2 && next.paused) {
        void next.play().catch(() => {})
        const gCur = this.gains[this.cur]
        const gNext = this.gains[nextIdx]
        gCur.gain.cancelScheduledValues(now)
        gCur.gain.setValueAtTime(gCur.gain.value, now)
        gCur.gain.linearRampToValueAtTime(0, now + this.crossfade)
        gNext.gain.cancelScheduledValues(now)
        gNext.gain.setValueAtTime(0, now)
        gNext.gain.linearRampToValueAtTime(1, now + this.crossfade)
      }
      // 当前曲播完（已淡尽），切到下一首并复位
      if (remain <= 0.6) {
        cur.pause()
        cur.currentTime = 0
        this.cur = nextIdx
      }
    }
    this.checkTimer = window.setTimeout(this.scheduleLoop, 500)
  }

  stop() {
    if (!this.playing) return
    this.playing = false
    if (this.checkTimer) window.clearTimeout(this.checkTimer)
    const ctx = this.ctx
    if (ctx && this.master) {
      const now = ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.linearRampToValueAtTime(0.0001, now + 1.2)
    }
    window.setTimeout(() => {
      this.elements.forEach((el) => {
        el.pause()
        el.currentTime = 0
      })
      this.ctx?.close()
      this.ctx = null
      this.master = null
      this.elements = []
      this.sources = []
      this.gains = []
    }, 1300)
  }

  isPlaying() {
    return this.playing
  }
}

export const ambientMusic = new AmbientMusic()

/**
 * 回访用户（入场券已撕过）没有首次点击可触发，
 * 因此在用户首次与页面交互时再启动一次背景音乐。
 */
export function ensureMusicOnFirstInteraction() {
  const start = () => {
    if (!ambientMusic.isPlaying()) {
      void ambientMusic.start().catch(() => {})
    }
    window.removeEventListener('pointerdown', start)
    window.removeEventListener('keydown', start)
  }
  window.addEventListener('pointerdown', start, { once: true })
  window.addEventListener('keydown', start, { once: true })
}
