import { defaultState, normalizeState } from './state.js'

const KEY = 'ryfjwr.drums'

export function parseState(json) {
  return normalizeState(JSON.parse(json))
}

export function loadState() {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === null ? defaultState() : parseState(saved)
  } catch {
    return defaultState()
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
