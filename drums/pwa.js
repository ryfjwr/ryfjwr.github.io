if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    .catch(error => console.warn('Service worker registration failed:', error))
}
