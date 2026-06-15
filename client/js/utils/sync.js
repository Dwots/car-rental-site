async function syncPendingOrders() {
  if (!navigator.onLine) return

  let pending = []
  try {
    pending = await getPendingOrders()
  } catch (err) {
    console.warn('IndexedDB недоступна или переполнена:', err.message)
    return
  }

  if (!pending.length) {
    await syncOfflineLogs()
    return
  }

  for (const local of pending) {
    if (local.synced) {
      await cleanupSyncedPendingOrder(local)
      continue
    }

    if (local.sync_failed) continue

    try {
      let client = local.client

      if (!client.id) {
        try {
          client = await createClient(client)
        } catch (err) {
          if (!err.message.includes('уже существует')) throw err
          client = await findClient(client.passport)
        }
      }

      await saveCachedClient(client)

      const created = await createOrder({
        client_id: client.id,
        car_id: local.car_id,
        duration: local.duration,
        duration_type: local.duration_type
      })

      await saveCachedOrder(created)
      await deletePendingOrder(local.local_id)
      await markCachedCarStatus(local.car_id, 'rented')
      await saveOfflineLog('ORDER_SYNCED', 'order', created.id, {
        local_id: local.local_id
      })
      window.dispatchEvent(new CustomEvent('order-synced', {
        detail: { local_id: local.local_id, order: created }
      }))
    } catch (err) {
      if (isCarConflict(err)) {
        const failedLocal = {
          ...local,
          sync_failed: true,
          sync_error: err.message,
          last_sync_attempt_at: new Date().toISOString()
        }
        await savePendingOrder(failedLocal)
        await markCachedCarStatus(local.car_id, 'rented')
        await saveOfflineLog('ORDER_SYNC_FAILED', 'order', local.local_id, {
          car_id: local.car_id,
          error: err.message
        })
        window.dispatchEvent(new CustomEvent('order-sync-failed', {
          detail: { local_id: local.local_id, order: failedLocal }
        }))
      }
      console.warn('Не удалось синхронизировать заказ', local.local_id, err.message)
    }
  }

  await syncOfflineLogs()
}

async function syncOfflineLogs() {
  if (!navigator.onLine) return

  let logs = []
  try {
    logs = await getOfflineLogs()
  } catch (err) {
    console.warn('Офлайн-журнал недоступен:', err.message)
    return
  }

  if (!logs.length) return

  try {
    await apiRequest('POST', '/api/logs', { logs })
    await Promise.all(logs.map(log => deleteOfflineLog(log.id)))
  } catch (err) {
    console.warn('Не удалось синхронизировать офлайн-журнал', err.message)
  }
}

window.addEventListener('online', syncPendingOrders)
document.addEventListener('DOMContentLoaded', () => {
  syncPendingOrders().catch(err => {
    console.warn('Синхронизация не запущена:', err.message)
  })
})

function isCarConflict(err) {
  return err?.message?.includes('Автомобиль уже сдан')
}

async function cleanupSyncedPendingOrder(local) {
  const serverId = local.server_id || (typeof local.id === 'number' ? local.id : null)
  if (!serverId) return

  await saveCachedOrder({
    ...local,
    id: serverId,
    server_id: serverId,
    synced: true,
    is_saved_to_db: true
  })
  await deletePendingOrder(local.local_id)
}
