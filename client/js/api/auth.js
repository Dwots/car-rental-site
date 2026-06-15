async function loginRequest(login, password) {
  return apiRequest('POST', '/api/auth/login', { login, password })
}
