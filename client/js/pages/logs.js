document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading')
  const errorMsg = document.getElementById('error-msg')
  const tableWrapper = document.getElementById('table-wrapper')
  const tbody = document.getElementById('logs-tbody')
  const refreshBtn = document.getElementById('refresh-btn')

  async function loadLogs() {
    loading.classList.remove('hidden')
    errorMsg.classList.add('hidden')
    tableWrapper.classList.add('hidden')

    try {
      const logs = await getLogs(150)
      renderLogs(logs)
      tableWrapper.classList.remove('hidden')
    } catch (err) {
      errorMsg.textContent = err.message || 'Не удалось загрузить журнал'
      errorMsg.classList.remove('hidden')
    } finally {
      loading.classList.add('hidden')
    }
  }

  function renderLogs(logs) {
    if (!logs.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-secondary">Записей пока нет</td>
        </tr>
      `
      return
    }

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td>${escapeHtml(formatDate(log.created_at))}</td>
        <td>
          <span class="status-badge ${getActionClass(log.action)}">
            ${escapeHtml(getActionLabel(log.action))}
          </span>
        </td>
        <td>${escapeHtml(log.employee_name || log.employee_login || `ID ${log.employee_id}`)}</td>
        <td>${escapeHtml(log.entity_type)}</td>
        <td>${escapeHtml(log.entity_id || '—')}</td>
        <td><code>${escapeHtml(formatDetails(log.details))}</code></td>
      </tr>
    `).join('')
  }

  refreshBtn.addEventListener('click', loadLogs)
  await loadLogs()
})

function getActionLabel(action) {
  const labels = {
    EMPLOYEE_LOGIN: 'Вход',
    CLIENT_SEARCHED: 'Поиск клиента',
    CLIENT_CREATED: 'Клиент создан',
    CLIENT_CREATED_OFFLINE: 'Клиент офлайн',
    CLIENT_ORDERS_SEARCHED: 'Поиск по паспорту',
    ORDER_CREATED: 'Заказ создан',
    ORDER_CREATED_OFFLINE: 'Заказ офлайн',
    ORDER_SYNCED: 'Заказ синхронизирован',
    ORDER_SYNC_FAILED: 'Ошибка синхронизации',
    ORDER_SEARCHED: 'Поиск заказа',
    ORDER_RETURNED: 'Возврат',
    RETURN_BLOCKED_OFFLINE: 'Возврат заблокирован',
    CAR_STATUS_CHANGED: 'Статус авто',
    CONTRACT_PRINTED: 'Печать',
    CONTRACT_PRINTED_OFFLINE: 'Печать офлайн'
  }
  return labels[action] || action
}

function getActionClass(action) {
  if (action.includes('OFFLINE') || action.includes('BLOCKED')) return 'status-yellow'
  if (action.includes('RETURNED') || action.includes('PRINTED')) return 'status-green'
  if (action.includes('CREATED') || action.includes('SYNCED')) return 'status-green'
  return 'status-yellow'
}

function formatDetails(details) {
  if (!details) return '—'
  if (typeof details === 'string') return details
  return JSON.stringify(details)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
