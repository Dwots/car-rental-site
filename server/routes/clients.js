const express = require('express')
const router = express.Router()
const db = require('../db')
const { encrypt, decrypt } = require('../utils/encrypt')
const { logAction } = require('../utils/audit')
const authMiddleware = require('../middleware/auth')

function maskPassport(passport) {
  const digits = String(passport).replace(/\D/g, '')
  return digits.length >= 4 ? `**** ${digits.slice(-4)}` : '****'
}

// GET /api/clients/:passport
router.get('/:passport', authMiddleware, (req, res) => {
  const { passport } = req.params
  const employeeId = req.employee.id

  // Ищем по всем клиентам и сравниваем расшифрованный паспорт
  const clients = db.prepare('SELECT * FROM clients').all()
  const client = clients.find(c => {
    try { return decrypt(c.passport) === passport } catch { return false }
  })

  logAction(employeeId, 'CLIENT_SEARCHED', 'client', null, {
    passport_masked: maskPassport(passport)
  })

  if (!client) {
    return res.status(404).json({ error: 'Клиент не найден' })
  }

  res.json({
    ...client,
    passport: decrypt(client.passport),
    driver_license: decrypt(client.driver_license),
    phone: decrypt(client.phone),
    address: decrypt(client.address)
  })
})

// POST /api/clients
router.post('/', authMiddleware, (req, res) => {
  const employeeId = req.employee.id

  // На фронте поля могут быть зашифрованы
  const passportPlain = decrypt(req.body.passport)
  const full_name = req.body.full_name
  const phonePlain = decrypt(req.body.phone)
  const addressPlain = decrypt(req.body.address)
  const driverPlain = decrypt(req.body.driver_license)

  if (!passportPlain || !full_name || !phonePlain || !addressPlain || !driverPlain) {
    return res.status(400).json({ error: 'Заполните все поля' })
  }

  // Проверка уникальности паспорта
  const existing = db.prepare('SELECT * FROM clients').all()
  const duplicate = existing.find(c => {
    try { return decrypt(c.passport) === passportPlain } catch { return false }
  })

  if (duplicate) {
    return res.status(409).json({ error: 'Клиент с таким паспортом уже существует' })
  }

  const result = db.prepare(`
    INSERT INTO clients (passport, full_name, phone, address, driver_license)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    encrypt(passportPlain),
    full_name,
    encrypt(phonePlain),
    encrypt(addressPlain),
    encrypt(driverPlain)
  )

  logAction(employeeId, 'CLIENT_CREATED', 'client', result.lastInsertRowid)

  res.status(201).json({
    id: result.lastInsertRowid,
    passport: passportPlain,
    full_name,
    phone: phonePlain,
    address: addressPlain,
    driver_license: driverPlain
  })
})

module.exports = router
