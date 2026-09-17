/**
 * 纯 WebAudio 合成音频（零素材、零网络）：
 *  - BGM：海底低通 + C 大调五声音阶的魔性欢乐短句，16 步循环
 *  - 音效：全部用振荡器/噪声包络合成的“喵叫”与提示音
 *  - 音量分两条总线：bgmBus（可调）与 sfxBus（固定，保证音效不被盖住）
 * 微信小游戏用 wx.createWebAudioContext()；不可用时全部静默降级。
 */
import { loadJSON, saveJSON } from './storage'

const CFG_KEY = 'mcm_audio_v1'
const DEFAULT_BGM_VOL = 0.55 // 背景音乐默认音量（0~1，进度条可调）
const DEFAULT_SFX_VOL = 0.9 // 音效默认音量（0~1，独立于音乐）

const STEP = 0.235 // 每个八分音符秒数（≈127 BPM，轻快魔性）
const LOOP_STEPS = 16
const PHRASE_LEN = 4 // 四步一句

// 四句为一组：每句整体移调（半音），旋律与贝斯一起转，内部和声依然自洽。
// 0 原调 C → +2 D → +7 G → -2 Bb，最后一句回落，接下一轮原调。
// 偏移量都取自五声音阶兼容度数，不会出现“跑调”的变化音。
const PHRASE_SHIFTS = [0, 2, 7, -2]

// 每 16 步（一轮 16 步 = 一节）再整体轻微变调，四节一大循环：
// C → Bb → D → G → 回到 C。都是近关系调，听感是“轻轻换口气”而不是转调突兀。
const SECTION_SHIFTS = [0, -2, 2, -5]

// MIDI：C5=72 D5=74 E5=76 G5=79 A5=81 C6=84 ……
const MELODY = [76, 79, 81, 79, 76, 72, 74, 76, 79, 81, 84, 81, 79, 76, 74, null]
// 每小节起点/中点铺一个柔和根音（C / Am / F / G 经典循环）
const BASS = {
  0: 48,
  2: 43,
  4: 45,
  6: 52,
  8: 41,
  10: 48,
  12: 43,
  14: 50
}
// 偶尔冒一个水泡高音
const SPARKLE = { 3: 88, 7: 91, 15: 93 }

let actx = null
let master = null
let sfxBus = null
let bgmBus = null
let bgmFilter = null
let noiseBuf = null

let bgmVol = DEFAULT_BGM_VOL
let sfxVol = DEFAULT_SFX_VOL
let bgmWanted = false // 玩家首次触摸后才允许出声
let bgmTimer = 0
let bgmStep = 0
let bgmSection = 0 // 第几节（每节 16 步，4 节一大循环）
let bgmNextT = 0

function mtof(m) {
  return 440 * Math.pow(2, (m - 69) / 12)
}

/** 惰性创建上下文（必须在用户触摸回调里首次调用，绕过自动播放限制） */
function ensureCtx() {
  if (actx) return actx
  try {
    const AC = typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function'
      ? wx.createWebAudioContext()
      : null
    if (!AC) return null
    actx = AC

    master = actx.createGain()
    master.gain.value = 1
    master.connect(actx.destination)

    sfxBus = actx.createGain()
    sfxBus.gain.value = sfxVol
    sfxBus.connect(master)

    // 海底感：BGM 整体过低通，像水里听声音
    bgmFilter = actx.createBiquadFilter()
    bgmFilter.type = 'lowpass'
    bgmFilter.frequency.value = 2200
    bgmFilter.Q.value = 0.6
    bgmBus = actx.createGain()
    bgmBus.gain.value = bgmVol
    bgmFilter.connect(bgmBus)
    bgmBus.connect(master)

    // 预生成 0.4s 白噪声（敲壳用）
    const len = Math.floor(actx.sampleRate * 0.4)
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  } catch (e) {
    actx = null
  }
  return actx
}

// ---- 双独立音量（持久化：音乐 / 音效各一条进度条，0~1 连续可调）----
function loadVolumes() {
  const cfg = loadJSON(CFG_KEY)
  if (cfg && cfg.v === 2) {
    bgmVol = clampVol(typeof cfg.bgm === 'number' ? cfg.bgm : DEFAULT_BGM_VOL)
    sfxVol = clampVol(typeof cfg.sfx === 'number' ? cfg.sfx : DEFAULT_SFX_VOL)
  } else if (cfg && typeof cfg.bgm === 'number') {
    // 旧版三档存档迁移：0 高 / 1 低 / 2 关
    bgmVol = [0.55, 0.25, 0][Math.max(0, Math.min(2, cfg.bgm | 0))]
  }
}
function clampVol(v) {
  return Math.max(0, Math.min(1, v))
}
loadVolumes()

export function getBgmVol() {
  return bgmVol
}
export function getSfxVol() {
  return sfxVol
}

export function setBgmVol(v) {
  bgmVol = clampVol(v)
  saveJSON(CFG_KEY, { v: 2, bgm: bgmVol, sfx: sfxVol })
  if (ensureCtx()) applyBgmGain()
}

export function setSfxVol(v) {
  sfxVol = clampVol(v)
  saveJSON(CFG_KEY, { v: 2, bgm: bgmVol, sfx: sfxVol })
  if (actx && sfxBus) sfxBus.gain.setTargetAtTime(sfxVol, actx.currentTime, 0.05)
}

function applyBgmGain() {
  if (!actx || !bgmBus) return
  bgmBus.gain.setTargetAtTime(bgmVol, actx.currentTime, 0.08)
  if (bgmVol > 0 && bgmWanted) startScheduler()
  if (bgmVol === 0) stopScheduler()
}

// ---- 生命周期 ----
/** 首次触摸：解锁上下文并开始 BGM（幂等） */
export function unlockAudio() {
  if (!ensureCtx()) return
  bgmWanted = true
  if (actx.state === 'suspended') actx.resume()
  if (bgmVol > 0) startScheduler()
}

export function suspendAudio() {
  stopScheduler() // currentTime 会冻结，先停调度防止恢复时补帧叠音
  if (actx && actx.state === 'running') actx.suspend()
}

export function resumeAudio() {
  if (!actx) return
  if (actx.state === 'suspended') actx.resume()
  if (bgmWanted && bgmVol > 0) startScheduler()
}

// ---- BGM 步进音序器（lookahead 调度，定时器幂等防叠加）----
function startScheduler() {
  if (!actx || bgmTimer) return
  bgmNextT = actx.currentTime + 0.08
  bgmStep = 0
  bgmSection = 0
  bgmTimer = setInterval(schedulerTick, 120)
}

function stopScheduler() {
  if (bgmTimer) {
    clearInterval(bgmTimer)
    bgmTimer = 0
  }
}

function schedulerTick() {
  if (!actx) return
  while (bgmNextT < actx.currentTime + 0.28) {
    scheduleStep(bgmStep, bgmNextT, bgmSection)
    bgmNextT += STEP
    bgmStep += 1
    if (bgmStep >= LOOP_STEPS) {
      bgmStep = 0
      bgmSection = (bgmSection + 1) % SECTION_SHIFTS.length // 四节一循环
    }
  }
}

/** 单音（旋律/贝斯/水泡共用） */
function tone(when, midi, dur, { type = 'triangle', vol = 0.14, attack = 0.012 }) {
  const o = actx.createOscillator()
  const g = actx.createGain()
  o.type = type
  o.frequency.value = mtof(midi)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + attack)
  g.gain.setValueAtTime(vol, when + Math.max(attack, dur - 0.09))
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  o.connect(g)
  g.connect(bgmFilter)
  o.start(when)
  o.stop(when + dur + 0.02)
}

function scheduleStep(s, t, section) {
  // 乐句变调 + 节变调叠加：每 4 步换乐句，每 16 步换节，四节一大循环
  const phraseShift = PHRASE_SHIFTS[Math.floor(s / PHRASE_LEN)] || 0
  const sectionShift = SECTION_SHIFTS[section] || 0
  const shift = phraseShift + sectionShift
  const m = MELODY[s]
  if (m !== null && m !== undefined) {
    tone(t, m + shift, STEP * 1.05, { type: 'triangle', vol: 0.15 })
  }
  const b = BASS[s]
  if (b !== undefined) tone(t, b + shift, STEP * 1.9, { type: 'sine', vol: 0.17, attack: 0.02 })
  const sp = SPARKLE[s]
  if (sp !== undefined) tone(t + STEP * 0.5, sp + shift, STEP * 0.9, { type: 'sine', vol: 0.05 })
}

// ---- 音效合成 ----
function now() {
  return actx.currentTime
}

/**
 * 喵叫基元：音高先扬后落的包络 + 带通共鸣，可选尾部颤音（奶声感）
 */
function meow({ f0, f1, dur = 0.3, vol = 0.5, type = 'triangle', attack = 0.012, release = 0.09, vibrato = 0, when = 0 }) {
  if (!ensureCtx()) return
  const t0 = now() + when
  const o = actx.createOscillator()
  const g = actx.createGain()
  const bp = actx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = ((f0 + f1) / 2) * 1.5
  bp.Q.value = 1.1
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.45)
  o.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * 0.92), t0 + dur)

  if (vibrato > 0) {
    const lfo = actx.createOscillator()
    const lg = actx.createGain()
    lfo.type = 'sine'
    lfo.frequency.value = 5.5
    lg.gain.value = vibrato
    lfo.connect(lg)
    lg.connect(o.frequency)
    lfo.start(t0)
    lfo.stop(t0 + dur + 0.02)
  }

  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack)
  g.gain.setValueAtTime(vol, t0 + dur - release)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  o.connect(g)
  g.connect(bp)
  bp.connect(sfxBus)
  o.start(t0)
  o.stop(t0 + dur + 0.03)
}

/** 音乐式单音（音效里的琶音用，走音效总线） */
function sfxTone(whenOffset, midi, dur, { type = 'sine', vol = 0.3, attack = 0.01 } = {}) {
  if (!ensureCtx()) return
  const t0 = now() + whenOffset
  const o = actx.createOscillator()
  const g = actx.createGain()
  o.type = type
  o.frequency.value = mtof(midi)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack)
  g.gain.setValueAtTime(vol, t0 + dur - 0.08)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(sfxBus)
  o.start(t0)
  o.stop(t0 + dur + 0.03)
}

export const sfx = {
  /** 吃鱼：咀嚼声——低通噪声的三声“吧唧”脉冲 + 一记闷啵 */
  eat() {
    if (!ensureCtx()) return
    const t0 = now()

    const src = actx.createBufferSource()
    src.buffer = noiseBuf
    const lp = actx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1100
    lp.Q.value = 0.8
    const g = actx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    // 三声咀嚼脉冲，音量递减、间隔略缩，像真的嚼碎脆鱼（音量放大版）
    const pulses = [
      [0, 0.62],
      [0.046, 0.52],
      [0.085, 0.38]
    ]
    for (const [d, peak] of pulses) {
      g.gain.setValueAtTime(0.0001, t0 + d)
      g.gain.exponentialRampToValueAtTime(peak, t0 + d + 0.007)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.038)
    }
    src.connect(lp)
    lp.connect(g)
    g.connect(sfxBus)
    src.start(t0)
    src.stop(t0 + 0.16)

    // 低频“啵”：含住的口感
    const o = actx.createOscillator()
    const og = actx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(320, t0)
    o.frequency.exponentialRampToValueAtTime(160, t0 + 0.09)
    og.gain.setValueAtTime(0.0001, t0)
    og.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01)
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
    o.connect(og)
    og.connect(sfxBus)
    o.start(t0)
    o.stop(t0 + 0.12)
  },
  /** 经验满升级：正常音高、稍长的喵 */
  levelUp() {
    meow({ f0: 540, f1: 830, dur: 0.5, vol: 0.5, release: 0.14, vibrato: 5 })
  },
  /** 下蛋：柔和、慢起音的喵 */
  layEgg() {
    meow({ f0: 500, f1: 640, dur: 0.46, vol: 0.36, attack: 0.05, release: 0.14, vibrato: 7 })
  },
  /** 孵化过程：温暖三音上行琶音 */
  hatch() {
    sfxTone(0, 72, 0.34, { type: 'triangle', vol: 0.28 })
    sfxTone(0.14, 76, 0.34, { type: 'triangle', vol: 0.28 })
    sfxTone(0.28, 79, 0.5, { type: 'triangle', vol: 0.3 })
  },
  /** 敲碎蛋壳：噪声脆裂 + 低频闷击 */
  crack() {
    if (!ensureCtx()) return
    const t0 = now()
    // 白噪声脆裂
    const src = actx.createBufferSource()
    src.buffer = noiseBuf
    const bp = actx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(2400, t0)
    bp.frequency.exponentialRampToValueAtTime(600, t0 + 0.22)
    bp.Q.value = 0.9
    const g = actx.createGain()
    g.gain.setValueAtTime(0.5, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24)
    src.connect(bp)
    bp.connect(g)
    g.connect(sfxBus)
    src.start(t0)
    src.stop(t0 + 0.26)
    // 闷击
    const o = actx.createOscillator()
    const og = actx.createGain()
    o.type = 'square'
    o.frequency.setValueAtTime(180, t0)
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.09)
    og.gain.setValueAtTime(0.28, t0)
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
    o.connect(og)
    og.connect(sfxBus)
    o.start(t0)
    o.stop(t0 + 0.12)
  },
  /** 小猫出生：低音、奶声奶气的长喵 */
  born() {
    meow({ f0: 300, f1: 430, dur: 0.66, vol: 0.55, attack: 0.03, release: 0.18, vibrato: 12 })
  },
  /** 稀有猫：五声音阶上行闪光琶音 */
  rare() {
    const notes = [84, 88, 91, 96]
    notes.forEach((m, i) => sfxTone(i * 0.1, m, 0.42, { type: 'sine', vol: 0.32 }))
    sfxTone(0.42, 100, 0.7, { type: 'sine', vol: 0.26 }) // 高八度收尾余韵
  }
}
