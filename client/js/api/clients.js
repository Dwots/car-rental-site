async function findClient(passport) {
  return apiRequest('GET', `/api/clients/${encodeURIComponent(passport)}`)
}

async function createClient(data) {
  const payload = {
    ...data,
    passport: await encryptText(data.passport),
    phone: await encryptText(data.phone),
    address: await encryptText(data.address),
    driver_license: await encryptText(data.driver_license)
  }
  return apiRequest('POST', '/api/clients', payload)
}
