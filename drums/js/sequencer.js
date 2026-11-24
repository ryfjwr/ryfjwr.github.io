export const stepsPerBar = state => state.beats * 4
export const stepCount = state => stepsPerBar(state) * state.bars

// Each pair occupies half a quarter note, independently of swing.
export function stepOffset(step, swing, quarter) {
  const pair = quarter / 2
  return Math.floor(step / 2) * pair + (step % 2) * pair * swing / 100
}

export const loopDuration = state => state.beats * state.bars * 60 / state.bpm

export function stepHits(state, step) {
  const solo = state.tracks.some(track => track.solo)
  const hits = []
  state.tracks.forEach((track, index) => {
    const value = track.steps[step]
    if (value && !track.mute && (!solo || track.solo)) {
      hits.push({ index, velocity: value === 2 ? state.accent : 80 })
    }
  })
  // Open is triggered first so closed also chokes an open hit on the same step.
  return hits.reverse()
}

export function patternEvents(state, quarter = 60 / state.bpm) {
  return Array.from({ length: stepCount(state) }, (_, step) => ({
    step, time: stepOffset(step, state.swing, quarter), hits: stepHits(state, step)
  }))
}
