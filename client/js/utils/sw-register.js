if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.storage?.estimate()
      .then(({ usage = 0, quota = 1 }) => {
        if (usage / quota > 0.95) {
          console.warn('Service worker не зарегистрирован: хранилище браузера переполнено')
          return null
        }
        return navigator.serviceWorker.register('/sw.js')
      })
      .catch(() => navigator.serviceWorker.register('/sw.js'))
      .catch(err => {
        console.warn('Service worker не зарегистрирован:', err.message)
      })
  })
}
