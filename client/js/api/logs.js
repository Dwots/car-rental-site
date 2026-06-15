async function getLogs(limit = 100) {
  return apiRequest('GET', `/api/logs?limit=${encodeURIComponent(limit)}`)
}
