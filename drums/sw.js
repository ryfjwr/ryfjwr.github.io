// Bump this version whenever any listed file changes.
const VERSION = 1
const CACHE_PREFIX = `ryfjwr-pwa:${self.registration.scope}:`
const CACHE_NAME = CACHE_PREFIX + VERSION
const APP_SHELL = [
  './index.html',
  './style.css',
  './pwa.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/audio-engine.js',
  './js/instruments/hihat.js',
  './js/instruments/kick.js',
  './js/instruments/noise.js',
  './js/instruments/snare.js',
  './js/main.js',
  './js/midi-export.js',
  './js/scheduler.js',
  './js/sequencer.js',
  './js/state.js',
  './js/storage.js',
  './js/ui.js',
  './js/wav-export.js',
].map(path => new URL(path, self.registration.scope).href)
const ENTRY = APP_SHELL[0]
const START_URL = self.registration.scope

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' })))
  })())
})

// Let open tabs finish on the previous release before activating this one.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const page = url.origin + url.pathname
  const isEntry = request.mode === 'navigate' && (page === START_URL || page === ENTRY)
  const cacheKey = isEntry ? ENTRY : request.url
  if (!APP_SHELL.includes(cacheKey)) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    return (await cache.match(cacheKey)) ?? fetch(request)
  })())
})
