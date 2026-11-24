export function makeNoise(context) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const samples = buffer.getChannelData(0)
  let seed = 786433
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    samples[i] = seed / 2147483648 - 1
  }
  return buffer
}

export function noiseSource(context, buffer) {
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}
