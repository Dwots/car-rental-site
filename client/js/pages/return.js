document.addEventListener('DOMContentLoaded', () => {
  const orderInput = document.getElementById('order-input')
  const findOrderBtn = document.getElementById('find-order-btn')
  const orderDetails = document.getElementById('order-details')
  const successMsg = document.getElementById('success-msg')

  findOrderBtn.addEventListener('click', findOrder)
  orderInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') findOrder()
  })

  // Сканер штрих-кода
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
      orderInput.value = barcodeBuffer
      findOrder()
      barcodeBuffer = ''
    }
  })

  async function findOrder() {
    const id = orderInput.value.trim()
    if (!id) return

    if (!navigator.onLine) {
      await saveOfflineLog('RETURN_BLOCKED_OFFLINE', 'order', id)
      orderDetails.innerHTML = `
        <div class="alert alert-error">
          Возврат недоступен без подключения к серверу.
        </div>
      `
      return
    }

    orderDetails.innerHTML = '<div class="text-secondary">Загрузка...</div>'
    successMsg.classList.add('hidden')

    try {
      const o = await getOrder(id)

      if (o.status !== 'active') {
        orderDetails.innerHTML = `
          <div class="alert alert-error">
            Заказ № ${o.id} уже закрыт. Статус: <strong>${getStatusLabel(o.status)}</strong>
          </div>
        `
        return
      }

      orderDetails.innerHTML = `
        <div class="card">
          <div class="card-title">Заказ № ${o.id}</div>

          <div class="grid-2 mb-16">
            <div>
              <p style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">КЛИЕНТ</p>
              <div class="info-row"><span class="info-label">ФИО</span><span>${o.client_name}</span></div>
              <div class="info-row"><span class="info-label">Телефон</span><span>${o.client_phone}</span></div>
            </div>
            <div>
              <p style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">АВТОМОБИЛЬ</p>
              <div class="info-row"><span class="info-label">Марка/Модель</span><span>${o.brand} ${o.model} ${o.year}</span></div>
              <div class="info-row"><span class="info-label">Гос. номер</span><span>${o.reg_number}</span></div>
            </div>
          </div>

          <div class="info-row"><span class="info-label">Срок аренды</span><span>${formatDuration(o.duration, o.duration_type)}</span></div>
          <div class="info-row"><span class="info-label">Стоимость</span><span class="text-accent">${formatPrice(o.total_cost)}</span></div>
          <div class="info-row"><span class="info-label">Дата выдачи</span><span>${formatDate(o.created_at)}</span></div>

          <div style="margin-top:20px;">
            <button class="btn btn-primary" id="confirm-return-btn" style="width:100%; justify-content:center;">
              Подтвердить возврат автомобиля
            </button>
          </div>
        </div>
      `

      document.getElementById('confirm-return-btn').addEventListener('click', async () => {
        const btn = document.getElementById('confirm-return-btn')
        btn.disabled = true
        btn.textContent = 'Оформление возврата...'

        try {
          const result = await returnOrder(o.id)
          orderDetails.innerHTML = ''
          successMsg.className = 'alert alert-success'
          successMsg.innerHTML = `
            ✅ Автомобиль <strong>${o.brand} ${o.model}</strong> успешно возвращён.<br>
            Дата и время возврата: <strong>${formatDate(result.returned_at)}</strong>
          `
          orderInput.value = ''
        } catch (err) {
          btn.disabled = false
          btn.textContent = 'Подтвердить возврат автомобиля'
          orderDetails.insertAdjacentHTML('afterbegin', `
            <div class="alert alert-error">${err.message}</div>
          `)
        }
      })
    } catch (err) {
      orderDetails.innerHTML = `
        <div class="alert alert-error">${err.message || 'Заказ не найден'}</div>
      `
    }
  }
})
