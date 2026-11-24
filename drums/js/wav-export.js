import { ATTACK, createEngine } from './audio-engine.js'
import { loopDuration, patternEvents } from './sequencer.js'

const SAMPLE_RATE = 44100

export function encodeWav(left, right, sampleRate = SAMPLE_RATE) {
  const dataSize = left.length * 4
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  function tag(offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i))
  }
  tag(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  tag(36, 'data')
  view.setUint32(40, dataSize, true)
  function sample(value) {
    return Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767))
  }
  for (let i = 0; i < left.length; i++) {
    view.setInt16(44 + i * 4, sample(left[i]), true)
    view.setInt16(46 + i * 4, sample(right[i]), true)
  }
  return buffer
}

export async function renderWav(state, mode) {
  const Offline = window.OfflineAudioContext ?? window.webkitOfflineAudioContext
  if (!Offline) throw new Error('このブラウザーはオフラインレンダリングに対応していません。')
  const events = patternEvents(state)
  const duration = loopDuration(state)
  let lastEnd = duration
  let longest = 0
  for (const { time, hits } of events) {
    for (const { index } of hits) {
      const track = state.tracks[index]
      if (track.level === 0) continue
      const length = ATTACK + track.decay / 1000
      lastEnd = Math.max(lastEnd, time + length)
      longest = Math.max(longest, length)
    }
  }
  const warmup = mode === 'loop' ? Math.ceil(longest / duration) : 0
  const trim = Math.ceil(warmup * duration * SAMPLE_RATE)
  const frames = mode === 'loop'
    ? Math.round(duration * SAMPLE_RATE)
    : Math.ceil(lastEnd * SAMPLE_RATE)
  const context = new Offline(2, trim + frames, SAMPLE_RATE)
  const engine = createEngine(context, state.volume)
  const finalVoices = []
  for (let cycle = -warmup; cycle <= 0; cycle++) {
    for (const { time, hits } of events) {
      const at = Math.max(0, trim / SAMPLE_RATE + cycle * duration + time)
      for (const { index, velocity } of hits) {
        const voice = engine.trigger(index, velocity, state.tracks[index], at)
        if (voice && mode !== 'loop') finalVoices.push(voice)
      }
    }
  }
  const result = await context.startRendering()
  const end = mode === 'loop' ? trim + frames : Math.min(
    frames, Math.ceil(Math.max(duration, ...finalVoices.map(voice => voice.end)) * SAMPLE_RATE)
  )
  return encodeWav(result.getChannelData(0).subarray(trim, end), result.getChannelData(1).subarray(trim, end))
}
