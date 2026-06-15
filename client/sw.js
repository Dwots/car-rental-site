const CACHE_NAME = 'autorent-shell-v5'

const APP_SHELL = [
  '/pages/login.html',
  '/pages/new-order.html',
  '/pages/search.html',
  '/pages/cars.html',
  '/pages/return.html',
  '/pages/contract.html',
  '/pages/logs.html',
  '/css/main.css',
  '/css/print.css',
  '/js/api/auth.js',
  '/js/api/cars.js',
  '/js/api/clients.js',
  '/js/api/config.js',
  '/js/api/logs.js',
  '/js/api/orders.js',
  '/js/pages/login.js',
  '/js/pages/new-order.js',
  '/js/pages/search.js',
  '/js/pages/cars.js',
  '/js/pages/return.js',
  '/js/pages/contract.js',
  '/js/pages/logs.js',
  '/js/utils/auth-guard.js',
  '/js/utils/crypto.js',
  '/js/utils/format.js',
  '/js/utils/offline-db.js',
  '/js/utils/storage.js',
  '/js/utils/sync.js',
  '/js/utils/sw-register.js'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        APP_SHELL.map(url => cache.add(url).catch(() => undefined))
      ))
      .catch(() => undefined)
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  if (url.origin !== self.location.origin) {
    return
  }

  if (url.pathname.startsWith('/api/')) {
    return
  }

  if (event.request.method !== 'GET') {
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request, { ignoreSearch: true })
          .then(cached => cached || caches.match('/pages/login.html'))
      )
    )
    return
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached

      return fetch(event.request).then(response => {
        const copy = response.clone()
        caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, copy))
          .catch(() => undefined)
        return response
      }).catch(() => new Response('', {
        status: 503,
        statusText: 'Offline'
      }))
    })
  )
})
