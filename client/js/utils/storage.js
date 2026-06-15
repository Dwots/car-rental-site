function saveAuth(token, employee) {
  const employeeJson = JSON.stringify(employee)

  try {
    localStorage.setItem('token', token)
    localStorage.setItem('employee', employeeJson)
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('employee')
    return
  } catch (err) {
    clearAppStorage()
  }

  try {
    localStorage.setItem('token', token)
    localStorage.setItem('employee', employeeJson)
    return
  } catch (err) {
    sessionStorage.setItem('token', token)
    sessionStorage.setItem('employee', employeeJson)
  }
}

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token')
}

function getEmployee() {
  try {
    return JSON.parse(localStorage.getItem('employee') || sessionStorage.getItem('employee'))
  } catch {
    return null
  }
}

function clearAuth() {
  localStorage.removeItem('token')
  localStorage.removeItem('employee')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('employee')
}

function clearAppStorage() {
  localStorage.removeItem('token')
  localStorage.removeItem('employee')
  localStorage.removeItem('currentOrder')
  localStorage.removeItem('selectedClient')
  localStorage.removeItem('selectedCar')
}
