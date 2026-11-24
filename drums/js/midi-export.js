import { TRACKS } from './state.js'
import { patternEvents } from './sequencer.js'

const PPQN = 480
const CHANNEL = 9

function bigEndian(value, bytes) {
  return Array.from({ length: bytes }, (_, index) => (value >>> ((bytes - index - 1) * 8)) & 255)
}

function variableLength(value) {
  const bytes = [value & 127]
  while ((value >>= 7) > 0) bytes.unshift((value & 127) | 128)
  return bytes
}

export function encodeMidi(state) {
  const tempo = Math.round(60_000_000 / state.bpm)
  const lastTick = state.beats * state.bars * PPQN
  const events = [
    { tick: 0, data: [255, 81, 3, ...bigEndian(tempo, 3)] },
    { tick: 0, data: [255, 88, 4, state.beats, 2, 24, 8] }
  ]

  for (const { time, hits } of patternEvents(state, PPQN)) {
    const tick = Math.round(time)
    for (const { index, velocity } of hits) {
      const note = TRACKS[index].note
      events.push({ tick, data: [144 | CHANNEL, note, velocity] })
      events.push({ tick: Math.min(tick + 48, lastTick), data: [128 | CHANNEL, note, 0] })
    }
  }
  events.push({ tick: lastTick, data: [255, 47, 0] })
  events.sort((a, b) => a.tick - b.tick)
  const track = []
  let previous = 0
  for (const { tick, data } of events) {
    track.push(...variableLength(tick - previous), ...data)
    previous = tick
  }

  return Uint8Array.from([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, ...bigEndian(PPQN, 2),
    77, 84, 114, 107, ...bigEndian(track.length, 4), ...track
  ])
}
