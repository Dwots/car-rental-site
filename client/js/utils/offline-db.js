const DB_NAME = 'autorent_offline'
const DB_VERSION = 2
const CACHE_STORES = ['cached_orders', 'cached_clients', 'cached_cars']

function isQuotaError(err) {
  return err?.name === 'QuotaExceededError' ||
    err?.message?.toLowerCase().includes('quota')
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('pending_orders')) {
        db.createObjectStore('pending_orders', { keyPath: 'local_id' })
      }
      if (!db.objectStoreNames.contains('cached_orders')) {
        db.createObjectStore('cached_orders', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('cached_clients')) {
        db.createObjectStore('cached_clients', { keyPath: 'passport' })
      }
      if (!db.objectStoreNames.contains('cached_cars')) {
        db.createObjectStore('cached_cars', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('offline_logs')) {
        db.createObjectStore('offline_logs', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function put(storeName, value) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value)
    tx.oncomplete = () => resolve(value)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function putWithCacheCleanup(storeName, value) {
  try {
    return await put(storeName, value)
  } catch (err) {
    if (!isQuotaError(err) || !CACHE_STORES.includes(storeName)) {
      throw err
    }

    await clearOfflineCache()
    return put(storeName, value)
  }
}

async function getAll(storeName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function getByKey(storeName, key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function deleteByKey(storeName, key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function clearStore(storeName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function clearOfflineCache() {
  await Promise.all(CACHE_STORES.map(storeName => clearStore(storeName)))
}

async function replaceStore(storeName, values) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    values.forEach(value => store.put(value))
    tx.oncomplete = () => resolve(values)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function savePendingOrder(order) { return put('pending_orders', order) }
async function getPendingOrder(localId) { return getByKey('pending_orders', localId) }
async function getPendingOrders() { return getAll('pending_orders') }
async function deletePendingOrder(localId) { return deleteByKey('pending_orders', localId) }
async function saveCachedOrder(order) { return putWithCacheCleanup('cached_orders', order) }
async function getCachedOrder(id) { return getByKey('cached_orders', Number(id)) }
async function getCachedOrders() { return getAll('cached_orders') }
async function saveCachedClient(client) { return putWithCacheCleanup('cached_clients', client) }
async function getCachedClient(passport) { return getByKey('cached_clients', passport) }
async function saveCachedCars(cars) {
  try {
    return await replaceStore('cached_cars', cars)
  } catch (err) {
    if (!isQuotaError(err)) throw err
    await clearOfflineCache()
    return replaceStore('cached_cars', cars)
  }
}
async function getCachedCars() { return getAll('cached_cars') }
async function saveCachedCar(car) { return putWithCacheCleanup('cached_cars', car) }

async function markCachedCarStatus(carId, status) {
  const car = await getByKey('cached_cars', Number(carId))
  if (!car) return null

  const updated = { ...car, status }
  await saveCachedCar(updated)
  return updated
}

async function saveOfflineLog(action, entityType, entityId = null, details = {}) {
  const employee = getEmployee()
  const log = {
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    employee_id: employee?.id || null,
    action,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    details,
    created_at: new Date().toISOString()
  }
  await put('offline_logs', log)
  return log
}

async function getOfflineLogs() { return getAll('offline_logs') }
async function deleteOfflineLog(id) { return deleteByKey('offline_logs', id) }
