async function createOrder(data) {
  return apiRequest('POST', '/api/orders', data)
}

async function getOrder(id) {
  return apiRequest('GET', `/api/orders/${id}`)
}

async function returnOrder(id) {
  return apiRequest('PUT', `/api/orders/${id}/return`)
}

async function markOrderPrinted(id) {
  return apiRequest('PUT', `/api/orders/${id}/print`)
}

async function getOrdersByPassport(passport) {
  return apiRequest('GET', `/api/orders/by-passport/${encodeURIComponent(passport)}`)
}
