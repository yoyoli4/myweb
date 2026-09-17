'use client'

/**
 * 全部用 Web Audio 实时合成，无音频文件：
 * - playTear()：纸张被撕开的声音（滤波噪声 + 细碎纤维爆裂点）
 * - playClick()：「咔嚓」两段脆响，像快门 / 木扣合上
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let lastClickAt = 0

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 生成一段白噪声 buffer */
function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** 撕纸声：约 0.8s，起音柔和、带扫频和不规则纤维爆裂点 */
export function playTear() {
  const c = ac()
  if (!c || !master) return
  const t = c.currentTime

  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, 0.85)

  // 高通打底，让声音像纸而不是风
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 850

  // 带通扫频：撕裂瞬间高频、拖尾慢慢沉下去
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.7
  bp.frequency.setValueAtTime(3000, t)
  bp.frequency.exponentialRampToValueAtTime(760, t + 0.78)

  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.05)
  // 不规则纤维撕裂的起伏
  for (let i = 0; i < 11; i++) {
    const when = t + 0.07 + Math.random() * 0.68
    gain.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.18, when)
    gain.gain.linearRampToValueAtTime(0.14, when + 0.03)
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.84)

  src.connect(hp)
  hp.connect(bp)
  bp.connect(gain)
  gain.connect(master)
  src.start(t)
  src.stop(t + 0.86)
}

/** 「咔嚓」：先一记脆爆（ka），70ms 后再一声摩擦碎响（cha），底下垫一点木头厚度 */
export function playClick() {
  const c = ac()
  if (!c || !master) return
  const now = c.currentTime
  if (now - lastClickAt < 0.09) return
  lastClickAt = now

  // —— 「咔」：高频噪声爆点 ——
  const kaNoise = c.createBufferSource()
  kaNoise.buffer = noiseBuffer(c, 0.06)
  const kaHp = c.createBiquadFilter()
  kaHp.type = 'highpass'
  kaHp.frequency.value = 2100
  const kaGain = c.createGain()
  kaGain.gain.setValueAtTime(0.0001, now)
  kaGain.gain.exponentialRampToValueAtTime(0.32, now + 0.004)
  kaGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
  kaNoise.connect(kaHp)
  kaHp.connect(kaGain)
  kaGain.connect(master)
  kaNoise.start(now)
  kaNoise.stop(now + 0.07)

  // 「咔」里的金属亮音
  const ping = c.createOscillator()
  ping.type = 'triangle'
  ping.frequency.setValueAtTime(2100, now)
  ping.frequency.exponentialRampToValueAtTime(1150, now + 0.022)
  const pingGain = c.createGain()
  pingGain.gain.setValueAtTime(0.11, now)
  pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
  ping.connect(pingGain)
  pingGain.connect(master)
  ping.start(now)
  ping.stop(now + 0.035)

  // —— 「嚓」：70ms 后的带通碎响 ——
  const t2 = now + 0.07
  const chaNoise = c.createBufferSource()
  chaNoise.buffer = noiseBuffer(c, 0.09)
  const chaBp = c.createBiquadFilter()
  chaBp.type = 'bandpass'
  chaBp.frequency.value = 2900
  chaBp.Q.value = 0.7
  const chaGain = c.createGain()
  chaGain.gain.setValueAtTime(0.0001, t2)
  chaGain.gain.exponentialRampToValueAtTime(0.2, t2 + 0.006)
  chaGain.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.075)
  chaNoise.connect(chaBp)
  chaBp.connect(chaGain)
  chaGain.connect(master)
  chaNoise.start(t2)
  chaNoise.stop(t2 + 0.1)

  // —— 低频木身，让脆响有实体 ——
  const body = c.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(180, now)
  body.frequency.exponentialRampToValueAtTime(95, now + 0.07)
  const bodyGain = c.createGain()
  bodyGain.gain.setValueAtTime(0.06, now)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
  body.connect(bodyGain)
  bodyGain.connect(master)
  body.start(now)
  body.stop(now + 0.09)
}

/** 地图页点击：圆润柔和的单音（不叠加，干净的一声） */
export function playMapClick() {
  const c = ac()
  if (!c || !master) return
  const m = master
  const now = c.currentTime

  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1046, now) // C6
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.18) // 轻微下滑，更温润
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(0.2, now + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
  osc.connect(g)
  g.connect(m)
  osc.start(now)
  osc.stop(now + 0.62)
}

/** 剧情页点击：柔和翻书页（低音量、缓慢包络、柔化高频） */
export function playStoryClick() {
  const c = ac()
  if (!c || !master) return
  const now = c.currentTime

  const noise = c.createBufferSource()
  noise.buffer = noiseBuffer(c, 0.2)
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1800
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2800
  bp.Q.value = 0.5
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.0001, now)
  ng.gain.linearRampToValueAtTime(0.07, now + 0.04)
  ng.gain.linearRampToValueAtTime(0.0001, now + 0.2)
  noise.connect(hp)
  hp.connect(bp)
  bp.connect(ng)
  ng.connect(master)
  noise.start(now)
  noise.stop(now + 0.22)
}

/** 抽牌点击：抽纸声（单层柔和的带通噪声缓慢扫频，无卡响） */
export function playDrawCard() {
  const c = ac()
  if (!c || !master) return
  const now = c.currentTime

  const noise = c.createBufferSource()
  noise.buffer = noiseBuffer(c, 0.5)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.9
  bp.frequency.setValueAtTime(1200, now)
  bp.frequency.exponentialRampToValueAtTime(2400, now + 0.22)
  bp.frequency.exponentialRampToValueAtTime(1600, now + 0.5)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.0001, now)
  ng.gain.linearRampToValueAtTime(0.1, now + 0.08)
  ng.gain.linearRampToValueAtTime(0.0001, now + 0.5)
  noise.connect(bp)
  bp.connect(ng)
  ng.connect(master)
  noise.start(now)
  noise.stop(now + 0.52)
}

/** 卡牌悬停：柔和细小的选中提示音（极轻的高频叮） */
let lastHoverAt = 0
export function playCardHover() {
  const c = ac()
  if (!c || !master) return
  const now = c.currentTime
  if (now - lastHoverAt < 0.09) return
  lastHoverAt = now

  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1760, now)
  osc.frequency.exponentialRampToValueAtTime(2640, now + 0.08)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.05, now + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
  osc.connect(g)
  g.connect(master)
  osc.start(now)
  osc.stop(now + 0.18)
}

/* ======================== 命运签（/fate） ======================== */

/**
 * 签筒猛震：木质哗啦 + 两声闷响，随后弦乐加入低沉不和谐长音
 * （G1 / bA1 小二度挤压 + D2 三全音，低音锯弦过暗滤波器，约 3.2s）
 */
export function playFortuneShake() {
  const c = ac()
  if (!c || !master) return
  const m = master
  const t = c.currentTime

  // —— 木质哗啦：带通噪声带不规则颤抖 ——
  const rattle = c.createBufferSource()
  rattle.buffer = noiseBuffer(c, 0.6)
  const rattleBp = c.createBiquadFilter()
  rattleBp.type = 'bandpass'
  rattleBp.frequency.value = 480
  rattleBp.Q.value = 1.3
  const rattleGain = c.createGain()
  rattleGain.gain.setValueAtTime(0.0001, t)
  rattleGain.gain.exponentialRampToValueAtTime(0.34, t + 0.02)
  for (let i = 0; i < 9; i++) {
    const when = t + 0.05 + i * 0.055
    rattleGain.gain.linearRampToValueAtTime(0.08 + Math.random() * 0.18, when)
    rattleGain.gain.linearRampToValueAtTime(0.12, when + 0.02)
  }
  rattleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58)
  rattle.connect(rattleBp)
  rattleBp.connect(rattleGain)
  rattleGain.connect(m)
  rattle.start(t)
  rattle.stop(t + 0.62)

  // —— 两声闷响，像筒底磕到木桌 ——
  for (const dt of [0, 0.16]) {
    const thud = c.createOscillator()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(150, t + dt)
    thud.frequency.exponentialRampToValueAtTime(52, t + dt + 0.14)
    const tg = c.createGain()
    tg.gain.setValueAtTime(0.26, t + dt)
    tg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18)
    thud.connect(tg)
    tg.connect(m)
    thud.start(t + dt)
    thud.stop(t + dt + 0.2)
  }

  // —— 低沉不和谐弦乐长音 ——
  const droneGain = c.createGain()
  droneGain.gain.setValueAtTime(0.0001, t)
  droneGain.gain.linearRampToValueAtTime(0.14, t + 0.35)   // 缓慢「加入」
  droneGain.gain.setValueAtTime(0.14, t + 2.3)
  droneGain.gain.exponentialRampToValueAtTime(0.0001, t + 3.3)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 360
  lp.Q.value = 0.5
  droneGain.connect(lp)
  lp.connect(m)

  // 揉弦：极慢的频率颤动
  const lfo = c.createOscillator()
  lfo.frequency.value = 4.2
  const lfoGain = c.createGain()
  lfoGain.gain.value = 1.6
  lfo.connect(lfoGain)

  const notes = [49.0, 51.9, 73.4] // G1 · bA1（小二度互斥）· D2（与 G 成三全音）
  notes.forEach((f, i) => {
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    o.detune.value = i === 1 ? 7 : -5
    lfoGain.connect(o.frequency)
    // 每把「琴」各自再过高通修形，避免低频糊成一团
    const tone = c.createBiquadFilter()
    tone.type = 'peaking'
    tone.frequency.value = 180 + i * 70
    tone.Q.value = 0.8
    tone.gain.value = 3
    o.connect(tone)
    tone.connect(droneGain)
    o.start(t)
    o.stop(t + 3.35)
  })
  lfo.start(t)
  lfo.stop(t + 3.35)
}

/** 眼睛显影：极轻的高频双音微差嗡鸣，像空气被盯紧时发出的声音 */
export function playFortuneEye() {
  const c = ac()
  if (!c || !master) return
  const t = c.currentTime
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.055, t + 0.5)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9)
  ;[1318.5, 1326.9].forEach((f) => {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.connect(g)
    o.start(t)
    o.stop(t + 1.95)
  })
  // 底下一缕凉气
  const air = c.createOscillator()
  air.type = 'triangle'
  air.frequency.setValueAtTime(110, t)
  air.frequency.exponentialRampToValueAtTime(82.4, t + 1.6)
  const ag = c.createGain()
  ag.gain.setValueAtTime(0.0001, t)
  ag.gain.linearRampToValueAtTime(0.05, t + 0.6)
  ag.gain.exponentialRampToValueAtTime(0.0001, t + 1.9)
  air.connect(ag)
  ag.connect(master)
  air.start(t)
  air.stop(t + 1.95)
  g.connect(master)
}

/** 签文逐笔刻显：极短促的刀刻木面声，每次音高随机微变 */
export function playFortuneChar() {
  const c = ac()
  if (!c || !master) return
  const t = c.currentTime
  const dur = 0.045 + Math.random() * 0.04

  // 噪声脉冲——刀锋刮过木面
  const noise = c.createBufferSource()
  noise.buffer = noiseBuffer(c, dur + 0.03)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2400 + Math.random() * 2000
  bp.Q.value = 1.4
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.0001, t)
  ng.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.025, t + 0.003)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  noise.connect(bp)
  bp.connect(ng)
  ng.connect(master)
  noise.start(t)
  noise.stop(t + dur + 0.04)

  // 木面共振——极微弱短音
  const osc = c.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = 340 + Math.random() * 140
  const og = c.createGain()
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(0.02, t + 0.004)
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8)
  osc.connect(og)
  og.connect(master)
  osc.start(t)
  osc.stop(t + dur)
}

/** 一记温和的实木轻叩（签离筒、钉墙） */
export function playWoodKnock() {
  const c = ac()
  if (!c || !master) return
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(240, t)
  o.frequency.exponentialRampToValueAtTime(110, t + 0.1)
  const g = c.createGain()
  g.gain.setValueAtTime(0.22, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
  o.connect(g)
  g.connect(master)
  o.start(t)
  o.stop(t + 0.16)

  const n = c.createBufferSource()
  n.buffer = noiseBuffer(c, 0.04)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 850
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.14, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
  n.connect(bp)
  bp.connect(ng)
  ng.connect(master)
  n.start(t)
  n.stop(t + 0.05)
}
