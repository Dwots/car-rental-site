const API_BASE = 'http://localhost:5000'

function readAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token')
}

function removeAuthToken() {
  localStorage.removeItem('token')
  localStorage.removeItem('employee')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('employee')
}

async function apiRequest(method, url, data = null) {
  const token = readAuthToken()

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  }

  if (data) {
    options.body = JSON.stringify(data)
  }

  let response
  try {
    response = await fetch(`${API_BASE}${url}`, options)
  } catch (err) {
    throw new Error('Сервер недоступен')
  }

  if (response.status === 401 || response.status === 403) {
    removeAuthToken()
    window.location.href = '/pages/login.html'
    return
  }

  const json = await response.json()

  if (!response.ok) {
    throw new Error(json.error || 'Ошибка сервера')
  }

  return json
}
