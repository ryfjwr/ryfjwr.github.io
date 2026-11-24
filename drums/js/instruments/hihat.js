import { noiseSource } from './noise.js'

export function hihat(context, voice, time, pitch, decay, buffer) {
  const highpass = voice.node(context.createBiquadFilter())
  highpass.type = 'highpass'
  highpass.frequency.value = Math.min(6900 * pitch, context.sampleRate * 0.42)
  highpass.Q.value = 0.45
  highpass.connect(voice.output)

  const noise = voice.node(noiseSource(context, buffer))
  noise.connect(highpass)
  voice.start(noise)

  const metal = voice.node(context.createGain())
  metal.gain.value = 0.085
  metal.connect(highpass)
  for (const frequency of [317, 433, 541, 613]) {
    const oscillator = voice.node(context.createOscillator())
    oscillator.type = 'square'
    oscillator.frequency.value = frequency * pitch
    oscillator.connect(metal)
    voice.start(oscillator)
  }
}
