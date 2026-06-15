function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0
  }).format(price)
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null
  const normalized = dateStr.replace(' ', 'T')
  return new Date(normalized)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const date = parseLocalDate(dateStr)
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '—'
  const date = parseLocalDate(dateStr)
  return date.toLocaleDateString('ru-RU')
}

function formatDuration(duration, type) {
  return type === 'days'
    ? `${duration} ${pluralize(duration, 'сутки', 'суток', 'суток')}`
    : `${duration} ${pluralize(duration, 'час', 'часа', 'часов')}`
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

function getStatusLabel(status) {
  const map = {
    available: 'Доступен',
    rented: 'В аренде',
    maintenance: 'Обслуживание',
    active: 'Активен',
    returned: 'Возвращён',
    completed: 'Завершён'
  }
  return map[status] || status
}

function getStatusClass(status) {
  const map = {
    available: 'status-green',
    active: 'status-green',
    rented: 'status-red',
    maintenance: 'status-yellow',
    returned: 'status-yellow',
    completed: 'status-yellow'
  }
  return map[status] || 'status-yellow'
}


// ─── Водительское удостоверение ───
// Формат: ЦЦ XX ЦЦЦЦЦЦ
// где ЦЦ = две цифры (регион), XX = две цифры или буквы, ЦЦЦЦЦЦ = шесть цифр

function formatDriverLicense(value) {
  // Оставляем только цифры и буквы (кириллица + латиница)
  const cleaned = value.replace(/[^А-ЯA-Zа-яa-z0-9]/gi, '').toUpperCase().slice(0, 10)

  if (cleaned.length === 0) return ''
  if (cleaned.length <= 2) return cleaned
  if (cleaned.length <= 4) return cleaned.slice(0, 2) + ' ' + cleaned.slice(2)

  // ЦЦ XX ЦЦЦЦЦЦ
  return cleaned.slice(0, 2) + ' ' + cleaned.slice(2, 4) + ' ' + cleaned.slice(4)
}

function validateDriverLicense(value) {
  const cleaned = value.replace(/\s/g, '').toUpperCase()

  // Первые две — цифры (регион)
  // Следующие две — цифры или буквы (кириллица/латиница)
  // Последние шесть — только цифры
  const pattern = /^\d{2}[А-ЯA-Z0-9]{2}\d{6}$/

  if (!pattern.test(cleaned)) {
    return {
      valid: false,
      msg: 'Формат: "77 АА 123456" — регион (2 цифры), серия (2 знака), номер (6 цифр)'
    }
  }

  return { valid: true }
}