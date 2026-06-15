async function getCars(status = null) {
  const url = status ? `/api/cars?status=${status}` : '/api/cars'
  return apiRequest('GET', url)
}

async function getAvailableCars() {
  return apiRequest('GET', '/api/cars/available')
}
