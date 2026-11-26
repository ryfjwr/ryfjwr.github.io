import { defaultTone, METERS, TRACKS } from './state.js'
import { stepsPerBar } from './sequencer.js'

export const byId = id => document.getElementById(id)

function element(tag, text, className) {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  if (className) node.className = className
  return node
}

function button(text, action) {
  const node = element('button', text)
  node.addEventListener('click', action)
  return node
}

function control(name, value, config, change) {
  const label = element('label', null, 'control')
  const heading = element('span', name, 'control-name')
  const input = element(config.options ? 'select' : 'input')
  let output
  if (config.options) {
    for (const [number, caption] of config.options) {
      input.add(new Option(caption, number))
    }
  } else {
    input.type = config.type ?? 'range'
    input.min = config.min
    input.max = config.max
    input.step = config.step ?? 1
    if (input.type === 'range') {
      output = element('span', null, 'value')
      output.setAttribute('aria-hidden', 'true')
      heading.append(output)
    }
  }
  function update() {
    if (!output) return
    const formatted = input.value + (config.unit ?? '')
    output.textContent = formatted
    input.setAttribute('aria-valuetext', formatted)
  }
  input.value = value
  update()
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    const number = input.valueAsNumber ?? Number(input.value)
    input.value = Number.isFinite(number)
      ? Math.max(config.min ?? -Infinity, Math.min(config.max ?? Infinity, input.type === 'number' ? Math.round(number) : number))
      : value
    value = Number(input.value)
    update()
    change(value)
  })
  label.append(heading, input)
  return label
}

function statusLabel(cell, value) {
  cell.dataset.value = value
  cell.setAttribute('aria-pressed', String(value !== 0))
  cell.setAttribute('aria-label', cell.dataset.label + '、' + ['オフ', '通常', 'アクセント', 'ゴースト'][value])
}

export function createUI(getState, actions) {
  const sequence = byId('sequence')
  const modeButtons = byId('step-modes').querySelectorAll('button')
  let mode = 1
  let cells = []
  let active = -1
  let press
  let heldCell

  function paint(track, step) {
    statusLabel(cells[step][track], getState().tracks[track].steps[step])
  }

  function setStep(cell, mode) {
    const { track, step } = cell.dataset
    const pattern = getState().tracks[track].steps
    const value = pattern[step]
    if (mode === 1) pattern[step] = value ? 0 : 1
    else if (mode === 2) pattern[step] = value === 2 ? 1 : 2
    else pattern[step] = value === 3 ? 0 : 3
    paint(track, step)
    actions.changed()
  }

  function clearPress() {
    clearTimeout(press?.timer)
    press = undefined
  }

  sequence.addEventListener('pointerdown', event => {
    const cell = event.target.closest('.step')
    if (!cell || event.button !== 0 || !event.isPrimary) return
    clearPress()
    heldCell = undefined
    if (mode !== 1) return
    press = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      timer: setTimeout(() => {
        heldCell = cell
        setStep(cell, 2)
      }, 480)
    }
  })
  sequence.addEventListener('pointermove', event => {
    if (press?.id === event.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) clearPress()
  })
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    sequence.addEventListener(type, event => {
      if (press?.id === event.pointerId) clearPress()
    })
  }
  window.addEventListener('blur', clearPress)
  sequence.addEventListener('contextmenu', event => {
    if (event.target.closest('.step')) event.preventDefault()
  })
  sequence.addEventListener('click', event => {
    const cell = event.target.closest('.step')
    if (!cell) return
    if (heldCell === cell && (event.pointerType || event.detail > 0)) {
      heldCell = undefined
      return
    }
    setStep(cell, mode === 1 && event.shiftKey ? 2 : mode)
  })
  sequence.addEventListener('keydown', event => {
    const cell = event.target.closest('.step')
    if (!cell) return
    if (mode === 1 && event.shiftKey && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      if (!event.repeat) setStep(cell, 2)
    }
  })
  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      clearPress()
      mode = Number(button.dataset.stepMode)
      for (const option of modeButtons) option.setAttribute('aria-pressed', String(option === button))
    })
  }

  function renderGrid() {
    clearPress()
    heldCell = undefined
    const state = getState()
    const perBar = stepsPerBar(state)
    cells = Array.from({ length: perBar * state.bars }, () => [])
    const bars = []
    for (let bar = 0; bar < state.bars; bar++) {
      const section = element('section', null, 'bar')
      section.append(element('h3', (bar + 1) + ' 小節目'))
      const scroll = element('div', null, 'bar-scroll')
      const grid = element('div', null, 'grid')
      grid.style.setProperty('--steps', perBar)
      grid.append(element('span', null, 'row-label'))
      for (let i = 0; i < perBar; i++) {
        const beat = element('span', i % 4 === 0 ? String(i / 4 + 1) : '', 'beat-number')
        beat.setAttribute('aria-hidden', 'true')
        grid.append(beat)
      }
      TRACKS.forEach((track, index) => {
        grid.append(element('span', track.name, 'row-label'))
        for (let i = 0; i < perBar; i++) {
          const step = bar * perBar + i
          const cell = element('button', null, i % 4 === 0 ? 'step beat' : 'step')
          cell.dataset.track = index
          cell.dataset.step = step
          cell.dataset.label = track.name + '、' + (bar + 1) + '小節目、ステップ' + (i + 1)
          cells[step][index] = cell
          paint(index, step)
          grid.append(cell)
        }
      })
      scroll.append(grid)
      section.append(scroll)
      bars.push(section)
    }
    sequence.replaceChildren(...bars)
    position(active)
  }

  function position(step) {
    for (const cell of cells[active] ?? []) cell.classList.remove('current')
    active = step
    for (const cell of cells[step] ?? []) cell.classList.add('current')
  }

  function clearTrack(index) {
    getState().tracks[index].steps.fill(0)
    cells.forEach((_, step) => paint(index, step))
  }

  byId('clear').addEventListener('click', () => {
    TRACKS.forEach((_, index) => clearTrack(index))
    actions.changed()
  })

  function renderGlobals() {
    const state = getState()
    const settings = [
      ['bpm', 'BPM', { min: 40, max: 240, type: 'number' }],
      ['beats', '拍子', { options: METERS.map(beats => [beats, beats + '/4']) }],
      ['bars', '小節数', { options: [[1, '1 小節'], [2, '2 小節']] }],
      ['swing', 'Swing', { min: 50, max: 75, step: 0.1, unit: '%' }],
      ['accent', 'Accent Velocity', { min: 81, max: 127 }],
      ['volume', 'Master Volume', { min: 0, max: 100, unit: '%' }]
    ]
    byId('globals').replaceChildren(...settings.map(([key, name, config]) =>
      control(name, state[key], config, value => {
        state[key] = value
        if (key === 'beats' || key === 'bars') renderGrid()
        if (key === 'volume') actions.volume(value)
        actions.changed()
      })
    ))
  }

  function renderTracks() {
    byId('tracks').replaceChildren(...TRACKS.map((spec, index) => {
      const track = getState().tracks[index]
      const card = element('section', null, 'track')
      const sliders = element('div', null, 'sliders')
      function renderTone() {
        const settings = [
          ['level', 'Level', { min: 0, max: 100, unit: '%' }],
          ['tune', 'Tune', { min: -12, max: 12 }],
          ['decay', 'Decay', { min: spec.min, max: spec.max, unit: ' ms' }]
        ]
        sliders.replaceChildren(...settings.map(([key, label, config]) =>
          control(label, track[key], config, value => {
            track[key] = value
            actions.changed()
          })
        ))
      }
      renderTone()
      const buttons = element('div', null, 'actions track-actions')
      for (const key of ['mute', 'solo']) {
        const toggle = button(key === 'mute' ? 'Mute' : 'Solo', () => {
          track[key] = !track[key]
          toggle.setAttribute('aria-pressed', String(track[key]))
          actions.changed()
        })
        toggle.setAttribute('aria-pressed', String(track[key]))
        buttons.append(toggle)
      }
      buttons.append(
        button('試聴', () => actions.preview(index)),
        button('消去', () => {
          clearTrack(index)
          actions.changed()
        }),
        button('音色をリセット', () => {
          Object.assign(track, defaultTone(spec))
          renderTone()
          actions.changed()
        })
      )
      const heading = element('h3', spec.name)
      heading.id = 'track-' + spec.id
      card.setAttribute('aria-labelledby', heading.id)
      card.append(heading, sliders, buttons)
      return card
    }))
  }

  return {
    position,
    render() {
      renderGlobals()
      renderGrid()
      renderTracks()
    }
  }
}
