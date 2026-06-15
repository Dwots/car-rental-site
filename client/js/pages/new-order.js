document.addEventListener('DOMContentLoaded', async () => {
  let selectedClient = null
  let selectedCar = null

  const passportInput = document.getElementById('passport-input')
  const findClientBtn = document.getElementById('find-client-btn')
  const clientResult = document.getElementById('client-result')
  const carSelect = document.getElementById('car-select')
  const carDetails = document.getElementById('car-details')
  const durationInput = document.getElementById('duration-input')
  const durationTypeSelect = document.getElementById('duration-type')
  const priceDisplay = document.getElementById('price-display')
  const priceFormula = document.getElementById('price-formula')
  const priceTotal = document.getElementById('price-total')
  const submitBtn = document.getElementById('submit-order-btn')
  const errorMsg = document.getElementById('error-msg')

  function makeLocalId() {
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function isNetworkError(err) {
    return err.message === 'Сервер недоступен' || !navigator.onLine
  }

  function nowForDisplay() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  function validatePassport(value) {
    const cleaned = value.replace(/\s/g, '')
    if (!/^\d{10}$/.test(cleaned)) {
      return { valid: false, msg: 'Паспорт: 10 цифр. Пример: 1234 567890' }
    }
    return { valid: true, cleaned: cleaned.slice(0, 4) + ' ' + cleaned.slice(4) }
  }

  function formatPhone(value) {
    let digits = value.replace(/\D/g, '')
    if (digits.startsWith('8')) digits = '7' + digits.slice(1)
    if (digits.length === 0) return ''

    let result = '+7'
    if (digits.length > 1) result += ' (' + digits.slice(1, 4)
    if (digits.length >= 4) result += ') ' + digits.slice(4, 7)
    if (digits.length >= 7) result += '-' + digits.slice(7, 9)
    if (digits.length >= 9) result += '-' + digits.slice(9, 11)
    return result
  }

  function validatePhone(value) {
    const digits = value.replace(/\D/g, '')
    if (digits.length < 11) {
      return { valid: false, msg: 'Введите корректный номер телефона (11 цифр)' }
    }
    return { valid: true }
  }

  function normalizeLocalOrder(localId, durationVal) {
    const employee = getEmployee()
    const totalCost = durationVal * (
      durationTypeSelect.value === 'days'
        ? selectedCar.price_per_day
        : selectedCar.price_per_hour
    )

    return {
      id: localId,
      local_id: localId,
      server_id: null,
      employee_id: employee?.id || null,
      employee_name: employee?.full_name || 'Сотрудник',
      client_id: selectedClient.id || null,
      car_id: selectedCar.id,
      client: selectedClient,
      car: selectedCar,
      client_name: selectedClient.full_name,
      client_phone: selectedClient.phone,
      client_address: selectedClient.address,
      client_passport: selectedClient.passport,
      client_driver_license: selectedClient.driver_license,
      brand: selectedCar.brand,
      model: selectedCar.model,
      year: selectedCar.year,
      reg_number: selectedCar.reg_number,
      vin: selectedCar.vin,
      color: selectedCar.color,
      price_per_day: selectedCar.price_per_day,
      price_per_hour: selectedCar.price_per_hour,
      duration: durationVal,
      duration_type: durationTypeSelect.value,
      total_cost: totalCost,
      status: 'active',
      synced: false,
      is_saved_to_db: false,
      created_at: nowForDisplay()
    }
  }

  passportInput.addEventListener('input', () => {
    const digits = passportInput.value.replace(/\D/g, '').slice(0, 10)
    passportInput.value = digits.length > 4
      ? digits.slice(0, 4) + ' ' + digits.slice(4)
      : digits
  })

  await loadCars()

  findClientBtn.addEventListener('click', async () => {
    const raw = passportInput.value.trim()
    const validation = validatePassport(raw)

    if (!validation.valid) {
      showFieldError(passportInput, validation.msg)
      return
    }

    clearFieldError(passportInput)
    passportInput.value = validation.cleaned
    findClientBtn.disabled = true
    findClientBtn.textContent = 'Поиск...'
    clientResult.innerHTML = ''
    selectedClient = null
    checkReady()

    try {
      if (navigator.onLine) {
        const client = await findClient(validation.cleaned)
        selectedClient = client
        await saveCachedClient(client)
        renderClientCard(client)
        return
      }

      await showOfflineClient(validation.cleaned)
    } catch (err) {
      if (err.message === 'Клиент не найден') {
        renderNewClientForm(validation.cleaned)
      } else if (isNetworkError(err)) {
        await showOfflineClient(validation.cleaned)
      } else {
        clientResult.innerHTML = `<div class="alert alert-error">${err.message}</div>`
      }
    } finally {
      findClientBtn.disabled = false
      findClientBtn.textContent = 'Найти клиента'
    }
  })

  passportInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') findClientBtn.click()
  })

  carSelect.addEventListener('change', () => {
    const selected = carSelect.options[carSelect.selectedIndex]
    if (!selected.dataset.car) {
      selectedCar = null
      carDetails.innerHTML = ''
      priceDisplay.classList.add('hidden')
      checkReady()
      return
    }

    selectedCar = JSON.parse(selected.dataset.car)
    renderCarDetails(selectedCar)
    calculatePrice()
    checkReady()
  })

  durationInput.addEventListener('input', () => {
    durationInput.value = durationInput.value.replace(/[^\d]/g, '')
    if (parseInt(durationInput.value) < 1) durationInput.value = ''
    calculatePrice()
    checkReady()
  })

  durationTypeSelect.addEventListener('change', () => {
    calculatePrice()
    checkReady()
  })

  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner"></span> Оформление...'
    errorMsg.classList.add('hidden')

    const durationVal = parseInt(durationInput.value)

    try {
      if (navigator.onLine) {
        const client = await ensureServerClient(selectedClient)
        selectedClient = client

        const order = await createOrder({
          client_id: client.id,
          car_id: selectedCar.id,
          duration: durationVal,
          duration_type: durationTypeSelect.value
        })

        await saveCachedOrder(order)
        window.location.href = `contract.html?id=${order.id}`
        return
      }

      await saveLocalOrder(durationVal)
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await saveLocalOrder(durationVal)
        } catch (localErr) {
          errorMsg.className = 'alert alert-error'
          errorMsg.textContent = localErr.message
          errorMsg.classList.remove('hidden')
          submitBtn.disabled = false
          submitBtn.textContent = 'Оформить заказ'
        }
        return
      }

      errorMsg.className = 'alert alert-error'
      errorMsg.textContent = err.message
      errorMsg.classList.remove('hidden')
      submitBtn.disabled = false
      submitBtn.textContent = 'Оформить заказ'
    }
  })

  async function loadCars() {
    try {
      if (navigator.onLine) {
        const cars = await getAvailableCars()
        await saveCachedCars(cars)
        renderCars(await filterCarsAvailableForLocalQueue(cars))
        return
      }

      const cars = await getCachedCars()
      renderCars(await filterCarsAvailableForLocalQueue(cars.filter(c => c.status === 'available')))
    } catch (err) {
      const cachedCars = await getCachedCars()
      if (cachedCars.length > 0) {
        renderCars(await filterCarsAvailableForLocalQueue(cachedCars.filter(c => c.status === 'available')))
      } else {
        carSelect.innerHTML = '<option value="">Ошибка загрузки</option>'
      }
    }
  }

  async function filterCarsAvailableForLocalQueue(cars) {
    const pending = await getPendingOrders()
    const blockedCarIds = new Set(
      pending
        .filter(order => !order.synced && !order.sync_failed)
        .map(order => Number(order.car_id))
    )
    return cars.filter(car => !blockedCarIds.has(Number(car.id)))
  }

  function renderCars(cars) {
    carSelect.innerHTML = '<option value="">— Выберите автомобиль —</option>'
    cars.forEach(car => {
      const opt = document.createElement('option')
      opt.value = car.id
      opt.dataset.car = JSON.stringify(car)
      opt.textContent = `${car.brand} ${car.model} ${car.year} — ${car.reg_number} (${formatPrice(car.price_per_day)}/сутки)`
      carSelect.appendChild(opt)
    })
    if (cars.length === 0) {
      carSelect.innerHTML = '<option value="">Нет доступных автомобилей</option>'
    }
  }

  async function showOfflineClient(passport) {
    const cached = await getCachedClient(passport)
    if (cached) {
      selectedClient = cached
      renderClientCard(cached)
    } else {
      renderNewClientForm(passport)
    }
  }

  async function ensureServerClient(client) {
    if (client.id) return client

    try {
      return await findClient(client.passport)
    } catch (err) {
      if (err.message === 'Клиент не найден') {
        return createClient(client)
      }
      throw err
    }
  }

  async function saveLocalOrder(durationVal) {
    const existing = await getOpenLocalOrderForCar(selectedCar.id)
    if (existing) {
      throw new Error(`На этот автомобиль уже есть несинхронизированный офлайн-заказ: ${existing.local_id}`)
    }

    const localId = makeLocalId()
    const localOrder = normalizeLocalOrder(localId, durationVal)
    await savePendingOrder(localOrder)
    await markCachedCarStatus(selectedCar.id, 'rented')
    await saveOfflineLog('ORDER_CREATED_OFFLINE', 'order', localId, {
      car_id: selectedCar.id,
      duration: durationVal,
      duration_type: durationTypeSelect.value
    })
    openLocalContract(localId)
  }

  async function getOpenLocalOrderForCar(carId) {
    const pending = await getPendingOrders()
    return pending.find(order =>
      Number(order.car_id) === Number(carId) &&
      !order.synced &&
      !order.sync_failed
    )
  }

  function openLocalContract(localId) {
    const url = `contract.html?local_id=${encodeURIComponent(localId)}`
    sessionStorage.setItem('last_local_contract_url', url)

    if (navigator.serviceWorker?.controller) {
      window.location.href = url
      return
    }

    errorMsg.className = 'alert alert-success'
    errorMsg.innerHTML = `
      Заказ сохранён локально с номером <strong>${localId}</strong>.
      Страница договора откроется после восстановления сервера или обновления service worker.
    `
    errorMsg.classList.remove('hidden')
    submitBtn.disabled = true
    submitBtn.textContent = 'Заказ сохранён офлайн'
  }

  function showFieldError(input, msg) {
    clearFieldError(input)
    input.style.borderColor = 'var(--danger)'
    const err = document.createElement('div')
    err.className = 'field-error'
    err.style.cssText = 'color:#fc8181; font-size:12px; margin-top:4px;'
    err.textContent = msg
    input.parentNode.appendChild(err)
  }

  function clearFieldError(input) {
    input.style.borderColor = ''
    const existing = input.parentNode.querySelector('.field-error')
    if (existing) existing.remove()
  }

  function renderClientCard(client) {
    clientResult.innerHTML = `
      <div class="alert alert-success">✓ Клиент найден</div>
      <div style="margin-top:12px;">
        <div class="info-row"><span class="info-label">ФИО</span><span>${client.full_name}</span></div>
        <div class="info-row"><span class="info-label">Паспорт</span><span>${client.passport}</span></div>
        <div class="info-row"><span class="info-label">Телефон</span><span>${client.phone}</span></div>
        <div class="info-row"><span class="info-label">Адрес</span><span>${client.address}</span></div>
        <div class="info-row"><span class="info-label">Вод. удостоверение</span><span>${client.driver_license}</span></div>
      </div>
    `
    checkReady()
  }

  function renderNewClientForm(passport) {
    clientResult.innerHTML = `
      <div class="alert alert-error" style="margin-bottom:12px;">
        Клиент не найден. Заполните данные нового клиента:
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">ФИО *</label>
          <input type="text" id="new-fullname" class="form-input"
            placeholder="Иванов Иван Иванович">
        </div>
        <div class="form-group">
          <label class="form-label">Телефон *</label>
          <input type="text" id="new-phone" class="form-input"
            placeholder="+7 (999) 123-45-67" maxlength="18">
        </div>
        <div class="form-group">
          <label class="form-label">Адрес *</label>
          <input type="text" id="new-address" class="form-input"
            placeholder="г. Москва, ул. Примерная, д. 1">
        </div>
        <div class="form-group">
          <label class="form-label">Вод. удостоверение * <span style="color:var(--text-secondary); font-weight:400;">(77 АА 123456)</span></label>
          <input type="text" id="new-license" class="form-input"
            placeholder="77 АА 123456" maxlength="12">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Паспорт</label>
        <div class="flex gap-8" style="align-items:center;">
          <input type="text" id="new-passport" class="form-input"
            value="${passport}" style="max-width:200px;" maxlength="11">
          <span style="font-size:12px; color:var(--text-secondary);">
            Исправьте если ошиблись
          </span>
        </div>
        <div id="passport-edit-error"
          style="color:#fc8181; font-size:12px; margin-top:4px; display:none;"></div>
      </div>

      <button class="btn btn-primary" id="save-client-btn">Сохранить клиента</button>
      <div id="save-client-error" class="alert alert-error hidden" style="margin-top:8px;"></div>
    `

    const newPassportInput = document.getElementById('new-passport')
    newPassportInput.addEventListener('input', () => {
      const digits = newPassportInput.value.replace(/\D/g, '').slice(0, 10)
      newPassportInput.value = digits.length > 4
        ? digits.slice(0, 4) + ' ' + digits.slice(4)
        : digits
    })

    const phoneInput = document.getElementById('new-phone')
    phoneInput.addEventListener('input', () => {
      phoneInput.value = formatPhone(phoneInput.value)
    })

    const licenseInput = document.getElementById('new-license')
    licenseInput.addEventListener('input', () => {
      licenseInput.value = formatDriverLicense(licenseInput.value)
    })

    document.getElementById('save-client-btn').addEventListener('click', async () => {
      const btn = document.getElementById('save-client-btn')
      const saveErr = document.getElementById('save-client-error')
      const passportEditErr = document.getElementById('passport-edit-error')

      saveErr.classList.add('hidden')
      passportEditErr.style.display = 'none'

      const passportVal = validatePassport(newPassportInput.value)
      if (!passportVal.valid) {
        passportEditErr.textContent = passportVal.msg
        passportEditErr.style.display = 'block'
        return
      }

      const fullName = document.getElementById('new-fullname').value.trim()
      const phone = phoneInput.value.trim()
      const address = document.getElementById('new-address').value.trim()
      const driverLicense = licenseInput.value.trim()

      if (fullName.split(' ').filter(Boolean).length < 2) {
        saveErr.textContent = 'Введите полное ФИО (минимум имя и фамилия)'
        saveErr.classList.remove('hidden')
        return
      }

      const phoneVal = validatePhone(phone)
      if (!phoneVal.valid) {
        saveErr.textContent = phoneVal.msg
        saveErr.classList.remove('hidden')
        return
      }

      if (!address || address.length < 5) {
        saveErr.textContent = 'Введите корректный адрес (минимум 5 символов)'
        saveErr.classList.remove('hidden')
        return
      }

      const licenseVal = validateDriverLicense(driverLicense)
      if (!licenseVal.valid) {
        saveErr.textContent = licenseVal.msg
        saveErr.classList.remove('hidden')
        return
      }

      btn.disabled = true
      btn.textContent = 'Сохранение...'

      const plainClient = {
        id: null,
        passport: passportVal.cleaned,
        full_name: fullName,
        phone,
        address,
        driver_license: driverLicense
      }

      try {
        let client = plainClient
        if (navigator.onLine) {
          client = await createClient(plainClient)
        }

        selectedClient = client
        await saveCachedClient(client)
        passportInput.value = passportVal.cleaned
        renderClientCard(client)
      } catch (err) {
        if (isNetworkError(err)) {
          selectedClient = plainClient
          await saveCachedClient(plainClient)
          await saveOfflineLog('CLIENT_CREATED_OFFLINE', 'client', null, {
            passport_masked: `**** ${passportVal.cleaned.slice(-4)}`
          })
          passportInput.value = passportVal.cleaned
          renderClientCard(plainClient)
          return
        }

        saveErr.textContent = err.message
        saveErr.classList.remove('hidden')
        btn.disabled = false
        btn.textContent = 'Сохранить клиента'
      }
    })
  }

  function renderCarDetails(car) {
    carDetails.innerHTML = `
      <div style="margin-top:12px;">
        <div class="info-row"><span class="info-label">Марка / Модель</span><span>${car.brand} ${car.model} ${car.year}</span></div>
        <div class="info-row"><span class="info-label">Гос. номер</span><span>${car.reg_number}</span></div>
        <div class="info-row"><span class="info-label">VIN</span><span style="font-size:12px;">${car.vin}</span></div>
        <div class="info-row"><span class="info-label">Цвет</span><span>${car.color}</span></div>
        <div class="info-row"><span class="info-label">Цена за сутки</span><span class="text-accent">${formatPrice(car.price_per_day)}</span></div>
        <div class="info-row"><span class="info-label">Цена за час</span><span class="text-accent">${formatPrice(car.price_per_hour)}</span></div>
      </div>
    `
  }

  function calculatePrice() {
    if (!selectedCar || !durationInput.value) {
      priceDisplay.classList.add('hidden')
      return
    }

    const duration = parseInt(durationInput.value)
    const type = durationTypeSelect.value
    const price = type === 'days' ? selectedCar.price_per_day : selectedCar.price_per_hour
    const total = duration * price
    const typeLabel = type === 'days' ? 'сутки' : 'час'
    priceFormula.textContent = `${duration} × ${formatPrice(price)}/${typeLabel}`
    priceTotal.textContent = formatPrice(total)
    priceDisplay.classList.remove('hidden')
  }

  function checkReady() {
    const duration = parseInt(durationInput.value)
    submitBtn.disabled = !(selectedClient && selectedCar && duration > 0)
  }
})
