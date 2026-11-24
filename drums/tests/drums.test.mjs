import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultState, METERS } from '../js/state.js'
import { stepCount, stepOffset, patternEvents, loopDuration } from '../js/sequencer.js'
import { encodeMidi } from '../js/midi-export.js'
import { encodeWav } from '../js/wav-export.js'
import { loadState, parseState, saveState } from '../js/storage.js'

test('step counts, bar boundaries and durations for every meter and bar count', () => {
  for (const [beats, expected] of [[3, 12], [4, 16], [5, 20], [7, 28]]) {
    assert.ok(METERS.includes(beats))
    for (const bars of [1, 2]) {
      const state = { ...defaultState(), beats, bars, swing: 75 }
      assert.equal(stepCount(state), expected * bars)
      assert.equal(loopDuration(state), beats * bars / 2)
      assert.equal(stepOffset(expected, 75, 0.5), beats / 2)
      assert.equal(stepOffset(stepCount(state), 75, 0.5), loopDuration(state))
      const events = patternEvents(state)
      assert.equal(events.length, expected * bars)
      assert.ok(events.at(-1).time < loopDuration(state))
    }
  }
})

test('swing changes odd sixteenths and leaves pair boundaries fixed', () => {
  assert.equal(stepOffset(1, 50, 1), 0.25)
  assert.ok(Math.abs(stepOffset(1, 66.7, 1) - 1 / 3) < 0.0002)
  assert.equal(stepOffset(1, 75, 1), 0.375)
  assert.equal(stepOffset(2, 75, 1), 0.5)
  assert.equal(stepOffset(3, 75, 1), 0.875)
})

test('event velocities, mute and solo', () => {
  const state = defaultState()
  state.accent = 111
  state.tracks[0].steps[1] = 1
  state.tracks[1].steps[1] = 2
  state.tracks[2].steps[1] = 1
  state.tracks[2].mute = true
  assert.deepEqual(patternEvents(state)[1], {
    step: 1, time: 0.125, hits: [{ index: 1, velocity: 111 }, { index: 0, velocity: 80 }]
  })
  state.tracks[0].solo = true
  assert.deepEqual(patternEvents(state)[1].hits, [{ index: 0, velocity: 80 }])
})

function readMidi(bytes) {
  const view = new DataView(bytes.buffer)
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), 'MThd')
  assert.equal(view.getUint32(4), 6)
  assert.equal(view.getUint16(8), 0)
  assert.equal(view.getUint16(10), 1)
  assert.equal(view.getUint16(12), 480)
  assert.equal(Buffer.from(bytes.subarray(14, 18)).toString(), 'MTrk')
  assert.equal(view.getUint32(18), bytes.length - 22)
  let offset = 22
  let tick = 0
  function vlq() {
    let value = 0
    let byte
    do {
      byte = bytes[offset++]
      value = value * 128 + (byte & 127)
    } while (byte & 128)
    return value
  }
  const events = []
  while (offset < bytes.length) {
    tick += vlq()
    const status = bytes[offset++]
    const type = status === 255 ? bytes[offset++] : status
    const length = status === 255 ? vlq() : 2
    events.push([tick, type, ...bytes.subarray(offset, offset + length)])
    offset += length
  }
  return events
}

test('format 0 MIDI contains tempo, meter, swung GM hits and exact End of Track', () => {
  const state = { ...defaultState(), beats: 7, bars: 2, swing: 75 }
  state.tracks[0].steps[0] = 1
  state.tracks[1].steps[1] = 2
  state.tracks[2].steps[55] = 1
  state.tracks[3].steps[1] = 1
  state.tracks[3].mute = true
  assert.deepEqual(readMidi(encodeMidi(state)), [
    [0, 81, 7, 161, 32], [0, 88, 7, 2, 24, 8],
    [0, 153, 36, 80], [48, 137, 36, 0],
    [180, 153, 38, 120], [228, 137, 38, 0],
    [6660, 153, 42, 80], [6708, 137, 42, 0], [6720, 47]
  ])
  assert.deepEqual(readMidi(encodeMidi(defaultState())).at(-1), [1920, 47])
})

test('stereo WAV header, interleaving, scaling and clipping', () => {
  const bytes = encodeWav(Float32Array.of(-1.5, 0.5), Float32Array.of(1.5, -0.5))
  const view = new DataView(bytes)
  const tag = i => Buffer.from(bytes, i, 4).toString()
  assert.deepEqual([tag(0), tag(8), tag(12), tag(36)], ['RIFF', 'WAVE', 'fmt ', 'data'])
  assert.deepEqual([4, 16, 24, 28, 40].map(i => view.getUint32(i, true)), [44, 16, 44100, 176400, 8])
  assert.deepEqual([20, 22, 32, 34].map(i => view.getUint16(i, true)), [1, 2, 4, 16])
  assert.deepEqual([44, 46, 48, 50].map(i => view.getInt16(i, true)), [-32768, 32767, 16384, -16384])
})

test('saved state round-trips, old data is normalized and broken data falls back', () => {
  const items = new Map()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) }
  })
  try {
    const state = defaultState()
    state.tracks[0].steps[0] = 2
    state.tracks[0].solo = true
    assert.equal(saveState(state), true)
    assert.deepEqual(loadState(), state)
    const old = parseState('{"bpm":999,"beats":6,"swing":66.7,"tracks":[{"steps":[2,9],"tune":-20}]}')
    assert.equal(old.version, state.version)
    assert.equal(old.bpm, 240)
    assert.equal(old.beats, 4)
    assert.equal(old.swing, 66.7)
    assert.equal(old.tracks[0].tune, -12)
    assert.deepEqual(old.tracks[0].steps.slice(0, 2), [2, 0])
    assert.throws(() => parseState('{"version":99,"tracks":[]}'))
    items.set('ryfjwr.drums', '{')
    assert.deepEqual(loadState(), defaultState())
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})

test('offline export schedules all four synths and trims a choked tail', async () => {
  const { renderWav } = await import('../js/wav-export.js')
  const contexts = []
  const mockParam = () => ({
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {}
  })
  const mockNode = () => ({ connect: node => node, disconnect() {} })
  class Offline {
    constructor(channels, frames, sampleRate) {
      assert.equal(channels, 2)
      this.frames = frames
      this.sampleRate = sampleRate
      this.currentTime = 0
      this.destination = mockNode()
      this.sources = []
      contexts.push(this)
    }
    createGain() { return { ...mockNode(), gain: mockParam() } }
    createBufferSource() {
      const source = {
        ...mockNode(), frequency: mockParam(),
        start(at) { this.startTime = at },
        stop(at) { this.stopTime = at }
      }
      this.sources.push(source)
      return source
    }
    createOscillator() { return this.createBufferSource() }
    createBiquadFilter() { return { ...mockNode(), frequency: mockParam(), Q: mockParam() } }
    createBuffer(_channels, frames) { return { getChannelData: () => new Float32Array(frames) } }
    async startRendering() { return { getChannelData: () => new Float32Array(this.frames) } }
  }
  globalThis.window = { OfflineAudioContext: Offline }
  try {
    const state = defaultState()
    state.tracks[0].steps[0] = 1
    state.tracks[1].steps[4] = 1
    state.tracks[2].steps[15] = 1
    state.tracks[3].steps[14] = 1
    state.tracks[3].decay = 1000

    const tail = await renderWav(state, 'tail')
    assert.equal(contexts[0].sources.length, 13)
    const openSources = contexts[0].sources.filter(source => source.startTime === 1.75)
    assert.equal(openSources.length, 5)
    for (const source of openSources) assert.equal(source.stopTime, 1.875 + 0.006)
    assert.equal(tail.byteLength, 44 + 2 * 44100 * 4)

    state.tracks[2].steps[15] = 0
    const ringing = await renderWav(state, 'tail')
    assert.equal(ringing.byteLength, 44 + Math.ceil((1.75 + 0.002 + 1) * 44100) * 4)

    const loop = await renderWav(state, 'loop')
    assert.equal(loop.byteLength, 44 + 2 * 44100 * 4)
    assert.ok(contexts[2].sources.some(source => source.startTime < 2 && source.stopTime > 2))
  } finally {
    delete globalThis.window
  }
})
