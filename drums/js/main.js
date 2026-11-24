import { loadState, parseState, saveState } from './storage.js'
import { byId, createUI } from './ui.js'
import { createScheduler } from './scheduler.js'
import { encodeMidi } from './midi-export.js'
import { renderWav } from './wav-export.js'

let state = loadState()
const play = byId('play')
const stop = byId('stop')
const status = byId('status')
const scheduler = createScheduler(() => state, step => ui.position(step))
const ui = createUI(() => state, {
  changed: persist,
  volume: value => scheduler.setVolume(value),
  preview: async index => {
    try {
      await scheduler.preview(index)
    } catch (error) {
      status.textContent = error.message
    }
  }
})
ui.render()

function persist() {
  const saved = saveState(state)
  status.textContent = saved ? '' : 'ブラウザーへの自動保存ができません。JSON で保存できます。'
  return saved
}

let transportRequest = 0
play.addEventListener('click', async () => {
  const request = ++transportRequest
  play.disabled = true
  stop.disabled = false
  stop.focus()
  try {
    await scheduler.play()
  } catch (error) {
    if (request !== transportRequest) return
    stop.click()
    status.textContent = error.message
  }
})
stop.addEventListener('click', () => {
  transportRequest++
  scheduler.stop()
  stop.disabled = true
  play.disabled = false
  play.focus()
})

function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 15000)
}

byId('midi').addEventListener('click', () => {
  download(encodeMidi(state), 'drums.mid', 'audio/midi')
})
byId('json').addEventListener('click', () => {
  download(JSON.stringify(state, null, 2), 'drums.json', 'application/json')
})
const wav = byId('wav')
wav.addEventListener('click', async () => {
  const mode = byId('wav-mode').value
  wav.disabled = true
  status.textContent = 'WAV をレンダリング中…'
  try {
    const data = await renderWav(parseState(JSON.stringify(state)), mode)
    download(data, 'drums-' + mode + '.wav', 'audio/wav')
    status.textContent = 'WAV のレンダリングが完了しました。'
  } catch (error) {
    status.textContent = 'WAV を書き出せませんでした。' + error.message
  } finally {
    wav.disabled = false
  }
})

const file = byId('import-file')
byId('import').addEventListener('click', () => file.click())
file.addEventListener('change', async () => {
  const selected = file.files[0]
  if (!selected) return
  file.value = ''
  try {
    const imported = parseState(await selected.text())
    state = imported
    scheduler.setVolume(state.volume)
    ui.render()
    if (persist()) status.textContent = 'JSON を読み込みました。'
  } catch {
    status.textContent = 'JSON を読み込めませんでした。ファイルの形式とバージョンを確認してください。'
  }
})
