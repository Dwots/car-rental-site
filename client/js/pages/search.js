document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input')
  const searchBtn = document.getElementById('search-btn')
  const searchTypeSelect = document.getElementById('search-type')
  const resultDiv = document.getElementById('search-result')

  searchBtn.addEventListener('click', doSearch)
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch()
  })

  searchTypeSelect.addEventListener('change', () => {
    searchInput.value = ''
    resultDiv.innerHTML = ''
    if (searchTypeSelect.value === 'passport') {
      searchInput.placeholder = 'Номер паспорта (10 цифр)...'
      searchInput.maxLength = 11
    } else {
      searchInput.placeholder = 'Номер заказа...'
      searchInput.maxLength = 64
    }
  })

  searchInput.addEventListener('input', () => {
    if (searchTypeSelect.value === 'passport') {
      searchInput.value = formatPassportInput(searchInput.value)
    } else {
      searchInput.value = searchInput.value.replace(/[^a-zA-Zа-яА-Я0-9-]/g, '')
    }
  })

  let barcodeBuffer = ''
  let lastKeyTime = 0

  document.addEventListener('keydown', e => {
    const now = Date.now()
    if (now - lastKeyTime < 80) {
      if (e.key !== 'Enter' && e.key.length === 1) barcodeBuffer += e.key
    } else {
      barcodeBuffer = e.key.length === 1 ? e.key : ''
    }
    lastKeyTime = now

    if (e.key === 'Enter' && barcodeBuffer.length > 2) {
      searchInput.value = barcodeBuffer
      searchTypeSelect.value = 'order'
      doSearch()
      barcodeBuffer = ''
    }
  })

  async function doSearch() {
    const value = searchInput.value.trim()
    const type = searchTypeSelect.value

    if (!value) {
      resultDiv.innerHTML = '<div class="alert alert-error">Введите значение для поиска</div>'
      return
    }

    if (type === 'passport') {
      const cleaned = value.replace(/\s/g, '')
      if (!/^\d{10}$/.test(cleaned)) {
        resultDiv.innerHTML = '<div class="alert alert-error">Паспорт должен содержать 10 цифр. Пример: 1234 567890</div>'
        return
      }
    }

    resultDiv.innerHTML = '<div class="text-secondary">Поиск...</div>'

    try {
      if (type === 'order') {
        await searchByOrderId(value)
      } else {
        await searchByPassport(value)
      }
    } catch (err) {
      resultDiv.innerHTML = `<div class="alert alert-error">${err.message}</div>`
    }
  }

  async function searchByOrderId(id) {
    if (navigator.onLine) {
      try {
        const order = await getOrder(id)
        await saveCachedOrder(order)
        resultDiv.innerHTML = renderOrderCard(order)
        return
      } catch (err) {
        if (err.message !== 'Сервер недоступен' && err.message !== 'Заказ не найден') {
          throw err
        }
      }
    }

    const cached = await getCachedOrder(id)
    if (cached) {
      await saveOfflineLog('ORDER_SEARCHED_OFFLINE', 'order', id)
      resultDiv.innerHTML = renderOrderCard(cached)
      return
    }

    const pending = await getPendingOrders()
    const local = pending.find(p => p.local_id === id || String(p.server_id) === String(id))
    if (local) {
      await saveOfflineLog('ORDER_SEARCHED_OFFLINE', 'order', local.local_id)
      resultDiv.innerHTML = `
        <div class="alert alert-error">Заказ не загружен в БД (офлайн).</div>
      ` + renderOrderCard(local)
      return
    }

    throw new Error('Заказ не найден')
  }

  async function searchByPassport(passport) {
    const cleaned = passport.replace(/\s/g, '')
    const formatted = cleaned.slice(0, 4) + ' ' + cleaned.slice(4)

    if (navigator.onLine) {
      try {
        const data = await getOrdersByPassport(formatted)
        await Promise.all(data.orders.map(order => saveCachedOrder(order)))
        renderPassportResult(data)
        return
      } catch (err) {
        if (err.message !== 'Сервер недоступен') throw err
      }
    }

    const cached = (await getCachedOrders())
      .map(normalizeOrder)
      .filter(order => order.client_passport === formatted)

    const pending = (await getPendingOrders())
      .filter(order => normalizeOrder(order).client_passport === formatted)
      .map(normalizeOrder)

    const localOrders = [...cached, ...pending]

    if (localOrders.length > 0) {
      await saveOfflineLog('CLIENT_ORDERS_SEARCHED_OFFLINE', 'client', null, {
        passport_masked: `**** ${formatted.slice(-4)}`
      })
      resultDiv.innerHTML = `
        <div class="alert alert-error mb-16">Показаны данные из локального хранилища.</div>
        ${localOrders.map(o => renderOrderCard(o)).join('')}
      `
      return
    }

    throw new Error('Заказы по этому паспорту не найдены в локальном хранилище')
  }

  function renderPassportResult(data) {
    if (data.orders.length === 0) {
      resultDiv.innerHTML = `
        <div class="card">
          <div class="card-title">Клиент найден</div>
          <div class="info-row"><span class="info-label">ФИО</span><span>${data.client.full_name}</span></div>
          <div class="info-row"><span class="info-label">Телефон</span><span>${data.client.phone}</span></div>
          <div style="margin-top:16px;" class="text-secondary">Заказов не найдено</div>
        </div>
      `
      return
    }

    resultDiv.innerHTML = `
      <div class="card mb-16">
        <div class="card-title">Клиент: ${data.client.full_name}</div>
        <div class="info-row"><span class="info-label">Паспорт</span><span>${data.client.passport}</span></div>
        <div class="info-row"><span class="info-label">Телефон</span><span>${data.client.phone}</span></div>
        <div class="info-row"><span class="info-label">Адрес</span><span>${data.client.address}</span></div>
      </div>
      <p style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">
        Найдено заказов: ${data.orders.length}
      </p>
      ${data.orders.map(o => renderOrderCard(o)).join('')}
    `
  }

  function normalizeOrder(order) {
    if (!order.client || !order.car) return order

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
      color: order.color || order.car.color
    }
  }

  function getOrderNumber(order) {
    return order.server_id || order.id || order.local_id
  }

  function getContractHref(order) {
    if (order.is_saved_to_db && (order.server_id || typeof order.id === 'number')) {
      return `contract.html?id=${order.server_id || order.id}`
    }
    return `contract.html?local_id=${order.local_id}`
  }

  function renderOrderCard(rawOrder) {
    const o = normalizeOrder(rawOrder)
    const orderNumber = getOrderNumber(o)

    return `
      <div class="card mb-16">
        <div class="flex-between mb-16">
          <div class="card-title" style="margin-bottom:0;">Заказ № ${orderNumber}</div>
          <span class="status-badge ${getStatusClass(o.status)}">${getStatusLabel(o.status)}</span>
        </div>

        ${renderSyncAlert(o)}

        <div class="grid-2">
          <div>
            <p style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Клиент</p>
            <div class="info-row"><span class="info-label">ФИО</span><span>${o.client_name}</span></div>
            <div class="info-row"><span class="info-label">Телефон</span><span>${o.client_phone}</span></div>
            <div class="info-row"><span class="info-label">Вод. удостоверение</span><span>${o.client_driver_license}</span></div>
          </div>
          <div>
            <p style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Автомобиль</p>
            <div class="info-row"><span class="info-label">Марка/Модель</span><span>${o.brand} ${o.model} ${o.year}</span></div>
            <div class="info-row"><span class="info-label">Гос. номер</span><span>${o.reg_number}</span></div>
            <div class="info-row"><span class="info-label">Цвет</span><span>${o.color}</span></div>
          </div>
        </div>

        <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
          <div class="info-row"><span class="info-label">Срок аренды</span><span>${formatDuration(o.duration, o.duration_type)}</span></div>
          <div class="info-row"><span class="info-label">Стоимость</span><span class="text-accent">${formatPrice(o.total_cost)}</span></div>
          <div class="info-row"><span class="info-label">Дата оформления</span><span>${formatDate(o.created_at)}</span></div>
          <div class="info-row"><span class="info-label">Сотрудник</span><span>${o.employee_name || 'Сотрудник'} (ID: ${o.employee_id || '—'})</span></div>
        </div>

        <div style="margin-top:16px;">
          <a href="${getContractHref(o)}" class="btn btn-primary btn-sm">Открыть договор</a>
        </div>
      </div>
	  `
  }

  function formatPassportInput(value) {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    return digits.length > 4
      ? `${digits.slice(0, 4)} ${digits.slice(4)}`
      : digits
  }

  function renderSyncAlert(order) {
    if (order.sync_failed) {
      return `<div class="alert alert-error mb-16">Ошибка синхронизации: ${order.sync_error || 'заказ не загружен в БД'}</div>`
    }
    return order.is_saved_to_db ? '' : '<div class="alert alert-error mb-16">Не загружен в БД</div>'
  }
})
