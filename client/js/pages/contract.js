document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading')
  const content = document.getElementById('contract-content')
  const printBtn = document.getElementById('print-btn')
  const params = new URLSearchParams(window.location.search)
  const orderId = params.get('id')
  const localId = params.get('local_id')

  let currentOrder = null

  try {
    if (orderId) {
      currentOrder = await loadServerOrder(orderId)
    } else if (localId) {
      currentOrder = await getPendingOrder(localId)
    } else {
      loading.textContent = 'Номер заказа не указан'
      return
    }

    if (!currentOrder) {
      loading.textContent = 'Заказ не найден'
      return
    }

    currentOrder = normalizeOrder(currentOrder)
    loading.classList.add('hidden')
    content.innerHTML = renderContract(currentOrder)
    generateBarcode(getOrderNumber(currentOrder))
    setupPrint(currentOrder)
  } catch (err) {
    loading.textContent = `Ошибка загрузки договора: ${err.message}`
  }

  window.addEventListener('order-synced', async event => {
    if (!localId || event.detail?.local_id !== localId) return

    const updated = event.detail?.order || await getPendingOrder(localId)
    if (!updated) return

    currentOrder = normalizeOrder(updated)
    content.innerHTML = renderContract(currentOrder)
    generateBarcode(getOrderNumber(currentOrder))
    setupPrint(currentOrder)

    const serverId = currentOrder.server_id || (
      typeof currentOrder.id === 'number' ? currentOrder.id : null
    )
    if (serverId) {
      window.history.replaceState(null, '', `contract.html?id=${serverId}`)
    }
  })

  window.addEventListener('order-sync-failed', async event => {
    if (!localId || event.detail?.local_id !== localId) return

    const updated = await getPendingOrder(localId)
    if (!updated) return

    currentOrder = normalizeOrder(updated)
    content.innerHTML = renderContract(currentOrder)
    generateBarcode(getOrderNumber(currentOrder))
    setupPrint(currentOrder)
  })

  printBtn.addEventListener('click', async () => {
    if (!currentOrder?.is_saved_to_db) return

    const serverId = currentOrder.server_id || (
      typeof currentOrder.id === 'number' ? currentOrder.id : null
    )

    try {
      if (serverId && navigator.onLine) {
        await markOrderPrinted(serverId)
      } else {
        await saveOfflineLog('CONTRACT_PRINTED_OFFLINE', 'order', getOrderNumber(currentOrder))
      }
    } catch (err) {
      await saveOfflineLog('CONTRACT_PRINTED_OFFLINE', 'order', getOrderNumber(currentOrder), {
        error: err.message
      })
    }

    window.print()
  })
})

async function loadServerOrder(orderId) {
  try {
    const order = await getOrder(orderId)
    await saveCachedOrder(order)
    return order
  } catch (err) {
    const cached = await getCachedOrder(orderId)
    if (cached) return cached
    throw err
  }
}

function normalizeOrder(order) {
  if (order.client && order.car) {
    return {
      ...order,
      client_name: order.client_name || order.client.full_name,
      client_phone: order.client_phone || order.client.phone,
      client_address: order.client_address || order.client.address,
      client_passport: order.client_passport || order.client.passport,
      client_driver_license: order.client_driver_license || order.client.driver_license,
      brand: order.brand || order.car.brand,
      model: order.model || order.car.model,
      year: order.year || order.car.year,
      reg_number: order.reg_number || order.car.reg_number,
      vin: order.vin || order.car.vin,
      color: order.color || order.car.color,
      price_per_day: order.price_per_day || order.car.price_per_day,
      price_per_hour: order.price_per_hour || order.car.price_per_hour
    }
  }

  return order
}

function getOrderNumber(order) {
  return order.server_id || order.id || order.local_id
}

function setupPrint(order) {
  const printBtn = document.getElementById('print-btn')
  const content = document.getElementById('contract-content')

  if (order.is_saved_to_db) {
    printBtn.disabled = false
    return
  }

  printBtn.disabled = true
  if (order.sync_failed) {
    content.insertAdjacentHTML('afterbegin', `
      <div class="alert alert-error" style="margin-bottom:16px;">
        Договор не загружен в базу: ${order.sync_error || 'ошибка синхронизации'}.
        Выберите другой автомобиль и оформите новый заказ.
      </div>
    `)
    return
  }

  content.insertAdjacentHTML('afterbegin', `
    <div class="alert alert-error" style="margin-bottom:16px;">
      Договор ещё не загружен в базу. Подключитесь к сети и повторите попытку.
    </div>
  `)
}

function renderContract(o) {
  const orderNumber = getOrderNumber(o)

  return `
    <div class="contract-document">

      <!-- Шапка договора -->
      <div class="contract-header">
        <h2>ДОГОВОР АРЕНДЫ АВТОМОБИЛЯ</h2>
        <div class="contract-order-number">№ ${orderNumber}</div>
        <p>от ${formatDateOnly(o.created_at)} г.</p>

        <!-- Штрих-код заказа -->
        <div class="barcode-container">
          <svg id="barcode"></svg>
          <div class="barcode-label">Номер заказа: ${orderNumber}</div>
        </div>
      </div>

      <!-- Арендодатель -->
      <div class="contract-section">
        <h3>Арендодатель</h3>
        <div class="contract-row">
          <span class="contract-row-label">Организация:</span>
          <span>ООО «AutoRent»</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Адрес:</span>
          <span>г. Москва, ул. Примерная, д. 1</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Телефон:</span>
          <span>+7 (495) 000-00-00</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Оформил сотрудник:</span>
          <span>${o.employee_name || 'Сотрудник'} (ID: ${o.employee_id || '—'})</span>
        </div>
      </div>

      <!-- Арендатор -->
      <div class="contract-section">
        <h3>Арендатор</h3>
        <div class="contract-row">
          <span class="contract-row-label">ФИО:</span>
          <span>${o.client_name}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Паспорт:</span>
          <span>${o.client_passport}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Вод. удостоверение:</span>
          <span>${o.client_driver_license}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Телефон:</span>
          <span>${o.client_phone}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Адрес:</span>
          <span>${o.client_address}</span>
        </div>
      </div>

      <!-- Предмет аренды -->
      <div class="contract-section">
        <h3>Предмет аренды</h3>
        <div class="contract-row">
          <span class="contract-row-label">Автомобиль:</span>
          <span>${o.brand} ${o.model} ${o.year} г.</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Гос. номер:</span>
          <span>${o.reg_number}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">VIN:</span>
          <span>${o.vin}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Цвет:</span>
          <span>${o.color}</span>
        </div>
      </div>

      <!-- Срок и стоимость -->
      <div class="contract-section">
        <h3>Срок и стоимость</h3>
        <div class="contract-row">
          <span class="contract-row-label">Срок аренды:</span>
          <span>${formatDuration(o.duration, o.duration_type)}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Дата оформления:</span>
          <span>${formatDate(o.created_at)}</span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Итоговая стоимость:</span>
          <span><strong style="font-size:16px;">${formatPrice(o.total_cost)}</strong></span>
        </div>
        <div class="contract-row">
          <span class="contract-row-label">Статус заказа:</span>
          <span class="status-badge ${getStatusClass(o.status)}">${getStatusLabel(o.status)}</span>
        </div>
      </div>

      <!-- Условия -->
      <div class="contract-section">
        <h3>Условия аренды</h3>
        <div class="conditions">
          <p>1. Арендатор обязуется использовать транспортное средство в соответствии с его назначением и правилами дорожного движения.</p>
          <p>2. Арендатор несёт полную материальную ответственность за ущерб, причинённый транспортному средству в период аренды.</p>
          <p>3. Курение в автомобиле запрещено. При нарушении взимается штраф в размере 5 000 руб.</p>
          <p>4. Возврат автомобиля осуществляется в срок, указанный в настоящем договоре. При просрочке начисляется пеня в размере 10% от суточной стоимости за каждый час просрочки.</p>
          <p>5. Арендодатель вправе расторгнуть договор в одностороннем порядке при нарушении Арендатором условий настоящего договора.</p>
        </div>
      </div>

      <!-- Подписи -->
      <div class="signatures">
        <div class="signature-block">
          <p><strong>Арендодатель:</strong></p>
          <p>ООО «AutoRent»</p>
          <div class="signature-line"></div>
          <p style="font-size:11px; color:var(--text-secondary);">подпись / расшифровка</p>
        </div>
        <div class="signature-block">
          <p><strong>Арендатор:</strong></p>
          <p>${o.client_name}</p>
          <div class="signature-line"></div>
          <p style="font-size:11px; color:var(--text-secondary);">подпись / расшифровка</p>
        </div>
      </div>

    </div>
  `
}

function generateBarcode(orderId) {
  try {
    if (typeof JsBarcode === 'undefined') return
    JsBarcode('#barcode', String(orderId), {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: false,
      margin: 10,
      background: '#ffffff',
      lineColor: '#000000'
    })
  } catch (err) {
    console.error('Ошибка генерации штрих-кода:', err)
  }
}
