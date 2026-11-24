import { noiseSource } from './noise.js'

export function snare(context, voice, time, pitch, decay, buffer) {
  const oscillator = voice.node(context.createOscillator())
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(184 * pitch, time)
  oscillator.frequency.exponentialRampToValueAtTime(131 * pitch, time + Math.min(0.045, decay * 0.7))
  const body = voice.node(context.createGain())
  body.gain.setValueAtTime(0.48, time)
  body.gain.exponentialRampToValueAtTime(0.003, time + decay * 0.55)
  oscillator.connect(body).connect(voice.output)

  const noise = voice.node(noiseSource(context, buffer))
  const filter = voice.node(context.createBiquadFilter())
  filter.type = 'bandpass'
  filter.frequency.value = 1900 * pitch
  filter.Q.value = 0.6
  noise.connect(filter).connect(voice.output)
  voice.start(oscillator)
  voice.start(noise)
}
