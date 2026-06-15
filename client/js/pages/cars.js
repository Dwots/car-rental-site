document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading')
  const errorMsg = document.getElementById('error-msg')
  const tableWrapper = document.getElementById('table-wrapper')
  const tbody = document.getElementById('cars-tbody')
  const filterBtns = document.querySelectorAll('.filter-btn')

  let allCars = []
  let currentFilter = 'all'

  try {
    allCars = await getCars()
    loading.classList.add('hidden')
    tableWrapper.classList.remove('hidden')
    renderTable(allCars)
  } catch (err) {
    loading.classList.add('hidden')
    errorMsg.textContent = err.message
    errorMsg.classList.remove('hidden')
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentFilter = btn.dataset.filter

      const filtered = currentFilter === 'all'
        ? allCars
        : allCars.filter(c => c.status === currentFilter)

      renderTable(filtered)
    })
  })

  function renderTable(cars) {
    if (cars.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-secondary); padding:32px;">Нет автомобилей</td></tr>`
      return
    }

    tbody.innerHTML = cars.map(car => `
      <tr>
        <td><strong>${car.brand} ${car.model}</strong></td>
        <td>${car.year}</td>
        <td>${car.reg_number}</td>
        <td style="font-size:12px; color:var(--text-secondary);">${car.vin}</td>
        <td>${car.color}</td>
        <td class="text-accent">${formatPrice(car.price_per_day)}</td>
        <td class="text-accent">${formatPrice(car.price_per_hour)}</td>
        <td>
          <span class="status-badge ${getStatusClass(car.status)}">
            ${getStatusLabel(car.status)}
          </span>
        </td>
      </tr>
    `).join('')
  }
})
