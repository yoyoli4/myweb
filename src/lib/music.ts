/**
 * 背景音乐：三首真实曲目循环播放，共享同一个主控音量（音量同步），
 * 曲目间做柔和交叉淡入淡出，避免硬切。
 *
 * 曲目来自用户提供的音频（已放入 public/music/）：
 *  - ophelia-dream.mp3  （奥菲利亚的梦 - 梦）
 *  - dance-for-me-wallis.mp3（Abel Korzeniowski - Dance for Me Wallis）
 *  - tiandi-huanhuan.flac（闻神 - 天地缓缓 古琴版）
 */

export const TRACKS = [
  { src: '/music/ophelia-dream.mp3', name: '奥菲利亚的梦', sub: 'Ophelia Dream' },
  { src: '/music/dance-for-me-wallis.mp3', name: 'Dance for Me Wallis', sub: 'Abel Korzeniowski' },
  { src: '/music/tiandi-huanhuan.flac', name: '天地缓缓', sub: '古琴版 · 闻神' },
] as const

export interface MusicState {
  started: boolean   // 唱机是否已启动
  paused: boolean    // 是否暂停
  cur: number        // 当前曲目下标
  count: number
}

type Listener = (s: MusicState) => void

export class AmbientMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private elements: HTMLAudioElement[] = []
  private sources: MediaElementAudioSourceNode[] = []
  private gains: GainNode[] = []
  private cur = 0
  private started = false
  private paused = false
  private checkTimer: number | null = null
  private swapTimer: number | null = null
  private fadingTo: number | null = null
  private listeners = new Set<Listener>()
  private readonly crossfade = 4.5 // 秒
  private readonly volume = 0.32

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.getState())
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit() {
    const s = this.getState()
    this.listeners.forEach((fn) => fn(s))
  }

  getState(): MusicState {
    return { started: this.started, paused: this.paused, cur: this.cur, count: TRACKS.length }
  }

  async start() {
    if (this.started) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    const ctx = this.ctx
    await ctx.resume()

    // 共享主控音量
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    this.master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 2)

    TRACKS.forEach((t, i) => {
      const el = new Audio(t.src)
      el.crossOrigin = 'anonymous'
      // 只预加载第一首（立即播放），其余先不下载，等快轮到时再缓冲
      el.preload = i === 0 ? 'auto' : 'none'
      el.loop = false
      el.volume = 1
      const src = ctx.createMediaElementSource(el)
      const g = ctx.createGain()
      g.gain.value = i === 0 ? 1 : 0
      src.connect(g)
      g.connect(this.master!)
      this.elements.push(el)
      this.sources.push(src)
      this.gains.push(g)
    })

    this.started = true
    this.paused = false
    this.cur = 0
    await this.elements[0].play().catch(() => {})
    this.emit()
    this.scheduleLoop()
  }

  /** 手动切到指定曲目（交叉淡入淡出） */
  private crossfadeTo(nextIdx: number) {
    if (!this.ctx) return
    if (nextIdx === this.cur && this.fadingTo === null) return
    const now = this.ctx.currentTime
    const curEl = this.elements[this.cur]
    const nextEl = this.elements[nextIdx]

    nextEl.preload = 'auto'
    nextEl.load()

    // 取消上一次未完成的换曲收尾
    if (this.swapTimer) window.clearTimeout(this.swapTimer)

    const gCur = this.gains[this.cur]
    const gNext = this.gains[nextIdx]
    gCur.gain.cancelScheduledValues(now)
    gCur.gain.setValueAtTime(gCur.gain.value, now)
    gCur.gain.linearRampToValueAtTime(0, now + this.crossfade)
    gNext.gain.cancelScheduledValues(now)
    gNext.gain.setValueAtTime(gNext.gain.value, now)
    gNext.gain.linearRampToValueAtTime(this.paused ? 0 : 1, now + this.crossfade)
    void nextEl.play().catch(() => {})

    this.fadingTo = nextIdx
    this.swapTimer = window.setTimeout(() => {
      curEl.pause()
      curEl.currentTime = 0
      this.cur = nextIdx
      this.fadingTo = null
      this.swapTimer = null
      this.emit()
    }, this.crossfade * 1000 + 700)
  }

  next() {
    if (!this.started) return
    this.crossfadeTo((this.cur + 1) % TRACKS.length)
  }

  prev() {
    if (!this.started) return
    this.crossfadeTo((this.cur - 1 + TRACKS.length) % TRACKS.length)
  }

  /** 暂停 / 继续（手动切换） */
  async togglePause() {
    if (!this.started || !this.ctx || !this.master) return
    const now = this.ctx.currentTime
    if (!this.paused) {
      this.paused = true
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.45)
      window.setTimeout(() => {
        void this.ctx?.suspend()
        this.elements.forEach((el) => el.pause())
      }, 460)
    } else {
      this.paused = false
      await this.ctx.resume()
      void this.elements[this.fadingTo ?? this.cur].play().catch(() => {})
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.linearRampToValueAtTime(this.volume, now + 1.2)
    }
    this.emit()
  }

  private scheduleLoop = () => {
    if (!this.started || !this.ctx) return
    const cur = this.elements[this.cur]
    const nextIdx = (this.cur + 1) % TRACKS.length
    const next = this.elements[nextIdx]

    if (cur.duration && isFinite(cur.duration) && this.fadingTo === null) {
      const remain = cur.duration - cur.currentTime
      // 提前约 60 秒开始缓冲下一首（避免交叉淡入时还没下载完）
      if (remain <= 60 && next.preload !== 'auto') {
        next.preload = 'auto'
        next.load()
      }
      // 自然播完前 crossfade 秒启动下一首
      if (remain <= this.crossfade + 0.2 && next.paused && !this.paused) {
        this.crossfadeTo(nextIdx)
      }
    }
    this.checkTimer = window.setTimeout(this.scheduleLoop, 500)
  }

  stop() {
    if (!this.started) return
    this.started = false
    if (this.checkTimer) window.clearTimeout(this.checkTimer)
    if (this.swapTimer) window.clearTimeout(this.swapTimer)
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
      this.paused = false
      this.cur = 0
      this.fadingTo = null
      this.emit()
    }, 1300)
  }

  isPlaying() {
    return this.started
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
