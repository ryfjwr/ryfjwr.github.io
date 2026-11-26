export const VERSION = 2
export const METERS = [3, 4, 5, 7]
export const TRACKS = [
  { id: 'kick', name: 'Kick', note: 36, min: 30, max: 1000, decay: 250, level: 90 },
  { id: 'snare', name: 'Snare', note: 38, min: 20, max: 500, decay: 150, level: 78 },
  { id: 'closed', name: 'Closed Hi-Hat', note: 42, min: 10, max: 150, decay: 45, level: 65 },
  { id: 'open', name: 'Open Hi-Hat', note: 46, min: 50, max: 1000, decay: 350, level: 65 }
]
const MAX_STEPS = Math.max(...METERS) * 4 * 2

export function defaultTone(track) {
  return { level: track.level, tune: 0, decay: track.decay }
}

export function defaultState() {
  return {
    version: VERSION, beats: 4, bars: 1, bpm: 120, swing: 50, accent: 120, volume: 80,
    tracks: TRACKS.map(track => ({
      ...defaultTone(track), mute: false, solo: false, steps: Array(MAX_STEPS).fill(0)
    }))
  }
}

function bounded(value, min, max, fallback, round = Math.round) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, round(value))) : fallback
}

export function normalizeState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      (input.version !== undefined && ![1, VERSION].includes(input.version)) || !Array.isArray(input.tracks)) {
    throw new Error('対応するドラムマシンの設定ファイルではありません。')
  }
  const state = defaultState()
  state.beats = METERS.includes(input.beats) ? input.beats : state.beats
  state.bars = input.bars === 2 ? 2 : 1
  state.bpm = bounded(input.bpm, 40, 240, state.bpm)
  state.swing = bounded(input.swing, 50, 75, state.swing, value => Math.round(value * 10) / 10)
  state.accent = bounded(input.accent, 81, 127, state.accent)
  state.volume = bounded(input.volume, 0, 100, state.volume)
  state.tracks.forEach((track, index) => {
    const saved = input.tracks[index] ?? {}
    const spec = TRACKS[index]
    track.level = bounded(saved.level, 0, 100, track.level)
    track.tune = bounded(saved.tune, -12, 12, track.tune)
    track.decay = bounded(saved.decay, spec.min, spec.max, track.decay)
    track.mute = saved.mute === true
    track.solo = saved.solo === true
    if (Array.isArray(saved.steps)) {
      track.steps = track.steps.map((_, i) => [1, 2, 3].includes(saved.steps[i]) ? saved.steps[i] : 0)
    }
  })
  return state
}
