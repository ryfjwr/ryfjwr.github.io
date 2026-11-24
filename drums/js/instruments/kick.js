export function kick(context, voice, time, pitch, decay) {
  const oscillator = voice.node(context.createOscillator())
  oscillator.frequency.setValueAtTime(155 * pitch, time)
  oscillator.frequency.exponentialRampToValueAtTime(47 * pitch, time + Math.min(0.055, decay * 0.65))
  oscillator.connect(voice.output)
  voice.start(oscillator)
}
