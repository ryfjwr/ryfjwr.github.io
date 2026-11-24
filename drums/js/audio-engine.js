import { kick } from './instruments/kick.js'
import { snare } from './instruments/snare.js'
import { hihat } from './instruments/hihat.js'
import { makeNoise } from './instruments/noise.js'

const synths = [kick, snare, hihat, hihat]
const levels = [0.68, 0.41, 0.27, 0.29]
export const ATTACK = 0.002

export function createEngine(context, volume) {
  const master = context.createGain()
  master.gain.value = volume / 100
  master.connect(context.destination)
  const buffer = makeNoise(context)
  const voices = new Set()
  const closedHits = new Set()

  function trigger(index, velocity, track, time) {
    for (const closed of closedHits) {
      if (closed < context.currentTime) closedHits.delete(closed)
    }
    if (index === 2) {
      closedHits.add(time)
      for (const voice of voices) {
        if (voice.index === 3 && voice.time <= time) voice.choke(time)
      }
    }
    if (!track.level) return

    const decay = track.decay / 1000
    const peak = levels[index] * (track.level / 100) * (velocity / 127)
    const output = context.createGain()
    const gate = context.createGain()
    const nodes = [output, gate]
    const sources = []
    let end = time + ATTACK + decay
    output.gain.setValueAtTime(0, time)
    output.gain.linearRampToValueAtTime(peak, time + ATTACK)
    output.gain.exponentialRampToValueAtTime(peak * 0.001, end)
    output.connect(gate).connect(master)

    const voice = {
      index, time, output,
      get end() { return end },
      node(node) {
        nodes.push(node)
        return node
      },
      start(source) {
        sources.push(source)
        source.start(time)
        source.stop(end)
      },
      choke(at) {
        const cut = at + 0.006
        if (cut >= end) return
        end = cut
        gate.gain.cancelScheduledValues(at)
      gate.gain.setValueAtTime(1, at)
        gate.gain.linearRampToValueAtTime(0, end)
        for (const source of sources) source.stop(end)
      },
      stop(at) {
        for (const source of sources) source.stop(at)
        dispose()
      }
    }
    function dispose() {
      if (voices.delete(voice)) {
        for (const node of nodes) node.disconnect()
      }
    }

    voices.add(voice)
    synths[index](context, voice, time, 2 ** (track.tune / 12), decay, buffer)
    sources[0].onended = dispose
    if (index === 3) {
      for (const closed of closedHits) {
        if (closed >= time) voice.choke(closed)
      }
    }
    return voice
  }

  return {
    trigger,
    setVolume(value) {
      const now = context.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setTargetAtTime(value / 100, now, 0.015)
    },
    stop() {
      closedHits.clear()
      for (const voice of voices) voice.stop(context.currentTime)
    }
  }
}
