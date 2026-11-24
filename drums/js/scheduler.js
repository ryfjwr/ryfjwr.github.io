import { createEngine } from './audio-engine.js'
import { loopDuration, stepCount, stepHits, stepOffset } from './sequencer.js'

export function createScheduler(getState, onPosition) {
  let context, engine, timer, frame
  let playing = false
  let generation = 0
  let step = 0
  let nextTime = 0
  let pending = []

  async function ready() {
    if (!context) {
      const Audio = window.AudioContext ?? window.webkitAudioContext
      if (!Audio) throw new Error('このブラウザーは Web Audio に対応していません。')
      context = new Audio()
      engine = createEngine(context, getState().volume)
      context.addEventListener('statechange', pump)
    }
    if (context.state !== 'running') await context.resume()
  }

  function pump() {
    if (!playing || context.state !== 'running') return
    const state = getState()
    const count = stepCount(state)
    const quarter = 60 / state.bpm
    const now = context.currentTime
    const period = loopDuration(state)
    // Skip elapsed cycles after timer throttling while retaining the loop phase.
    if (nextTime < now - period) nextTime += Math.floor((now - nextTime) / period) * period
    step %= count
    while (nextTime < now + 0.1) {
      if (nextTime >= now - 0.015) {
        for (const hit of stepHits(state, step)) {
          engine.trigger(hit.index, hit.velocity, state.tracks[hit.index], Math.max(now, nextTime))
        }
        pending.push({ step, time: nextTime })
      }
      nextTime += stepOffset(step + 1, state.swing, quarter) - stepOffset(step, state.swing, quarter)
      step = (step + 1) % count
    }
    showPosition()
  }

  function showPosition() {
    let current
    while (pending.length && pending[0].time <= context.currentTime) current = pending.shift()
    if (current) onPosition(current.step)
  }

  function animate() {
    showPosition()
    frame = requestAnimationFrame(animate)
  }

  document.addEventListener('visibilitychange', pump)

  return {
    async play() {
      if (playing) return
      const attempt = ++generation
      await ready()
      if (attempt !== generation) return
      playing = true
      nextTime = context.currentTime + 0.025
      step = 0
      pump()
      timer = setInterval(pump, 25)
      frame = requestAnimationFrame(animate)
    },
    stop() {
      generation++
      playing = false
      clearInterval(timer)
      cancelAnimationFrame(frame)
      pending = []
      engine?.stop()
      onPosition(-1)
    },
    setVolume(value) {
      engine?.setVolume(value)
    },
    async preview(index) {
      const attempt = generation
      await ready()
      if (attempt === generation) engine.trigger(index, 80, getState().tracks[index], context.currentTime + 0.005)
    }
  }
}
