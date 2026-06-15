const express = require('express')
const router = express.Router()
const db = require('../db')
const { decrypt } = require('../utils/encrypt')
const { logAction } = require('../utils/audit')
const authMiddleware = require('../middleware/auth')

// Получить текущее время в московском часовом поясе для SQLite
function getMoscowTime() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Moscow' })
}

function toBool(value) {
  return Boolean(Number(value))
}

function maskPassport(passport) {
  const digits = String(passport).replace(/\D/g, '')
  return digits.length >= 4 ? `**** ${digits.slice(-4)}` : '****'
}

function mapOrder(order) {
  return {
    ...order,
    client_passport: decrypt(order.client_passport),
    client_driver_license: decrypt(order.client_driver_license),
    client_phone: decrypt(order.client_phone),
    client_address: decrypt(order.client_address),
    synced: toBool(order.synced),
    is_saved_to_db: toBool(order.is_saved_to_db)
  }
}

function getOrderWithDetails(id) {
  return db.prepare(`
    SELECT
      o.*,
      c.full_name as client_name,
      c.phone as client_phone,
      c.address as client_address,
      c.passport as client_passport,
      c.driver_license as client_driver_license,
      car.brand, car.model, car.year,
      car.reg_number, car.vin, car.color,
      car.price_per_day, car.price_per_hour,
      e.full_name as employee_name
    FROM orders o
    JOIN clients c ON o.client_id = c.id
    JOIN cars car ON o.car_id = car.id
    JOIN employees e ON o.employee_id = e.id
    WHERE o.id = ?
  `).get(id)
}

// POST /api/orders
router.post('/', authMiddleware, (req, res) => {
  const { client_id, car_id, duration, duration_type } = req.body
  const employee_id = req.employee.id

  if (!client_id || !car_id || !duration || !duration_type) {
    return res.status(400).json({ error: 'Заполните все поля' })
  }

  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(car_id)
  if (!car) return res.status(404).json({ error: 'Автомобиль не найден' })
  if (car.status !== 'available') {
    return res.status(409).json({ error: 'Автомобиль уже сдан в аренду' })
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id)
  if (!client) return res.status(404).json({ error: 'Клиент не найден' })

  const price = duration_type === 'days' ? car.price_per_day : car.price_per_hour
  const total_cost = Number(duration) * price
  const now = getMoscowTime()
  const clientSnapshot = JSON.stringify({
    id: client.id,
    passport: client.passport,
    full_name: client.full_name,
    phone: client.phone,
    address: client.address,
    driver_license: client.driver_license
  })
  const carSnapshot = JSON.stringify({
    id: car.id,
    brand: car.brand,
    model: car.model,
    year: car.year,
    reg_number: car.reg_number,
    vin: car.vin,
    color: car.color,
    price_per_day: car.price_per_day,
    price_per_hour: car.price_per_hour
  })

  const result = db.prepare(`
    INSERT INTO orders (
      employee_id, client_id, car_id, duration, duration_type,
      total_cost, created_at, synced, is_saved_to_db,
      client_snapshot_json, car_snapshot_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(
    employee_id, client_id, car_id, duration, duration_type,
    total_cost, now, clientSnapshot, carSnapshot
  )

  db.prepare("UPDATE cars SET status = 'rented' WHERE id = ?").run(car_id)

  logAction(employee_id, 'ORDER_CREATED', 'order', result.lastInsertRowid, { car_id })
  logAction(employee_id, 'CAR_STATUS_CHANGED', 'car', car_id, {
    from: car.status,
    to: 'rented'
  })

  const order = getOrderWithDetails(result.lastInsertRowid)
  res.status(201).json(mapOrder(order))
})

// GET /api/orders/by-passport/:passport
router.get('/by-passport/:passport', authMiddleware, (req, res) => {
  const { passport } = req.params

  const clients = db.prepare('SELECT * FROM clients').all()
  const client = clients.find(c => {
    try { return decrypt(c.passport) === passport } catch { return false }
  })

  logAction(req.employee.id, 'CLIENT_ORDERS_SEARCHED', 'client', client?.id || null, {
    passport_masked: maskPassport(passport)
  })

  if (!client) {
    return res.status(404).json({ error: 'Клиент с таким паспортом не найден' })
  }

  const orders = db.prepare(`
    SELECT
      o.*,
      c.full_name as client_name,
      c.phone as client_phone,
      c.address as client_address,
      c.passport as client_passport,
      c.driver_license as client_driver_license,
      car.brand, car.model, car.year,
      car.reg_number, car.vin, car.color,
      car.price_per_day, car.price_per_hour,
      e.full_name as employee_name
    FROM orders o
    JOIN clients c ON o.client_id = c.id
    JOIN cars car ON o.car_id = car.id
    JOIN employees e ON o.employee_id = e.id
    WHERE o.client_id = ?
    ORDER BY o.created_at DESC
  `).all(client.id)

  res.json({
    client: {
      ...client,
      passport: decrypt(client.passport),
      phone: decrypt(client.phone),
      address: decrypt(client.address),
      driver_license: decrypt(client.driver_license)
    },
    orders: orders.map(mapOrder)
  })
})

// GET /api/orders/:id
router.get('/:id', authMiddleware, (req, res) => {
  const order = getOrderWithDetails(req.params.id)
  if (!order) {
    logAction(req.employee.id, 'ORDER_SEARCHED', 'order', req.params.id, {
      found: false
    })
    return res.status(404).json({ error: 'Заказ не найден' })
  }

  logAction(req.employee.id, 'ORDER_SEARCHED', 'order', order.id, {
    found: true
  })
  res.json(mapOrder(order))
})

// PUT /api/orders/:id/return
router.put('/:id/return', authMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
  if (!order) return res.status(404).json({ error: 'Заказ не найден' })
  if (order.status !== 'active') {
    return res.status(409).json({ error: 'Заказ уже закрыт' })
  }

  const now = getMoscowTime()

  db.prepare(`
    UPDATE orders SET status = 'returned', returned_at = ?
    WHERE id = ?
  `).run(now, order.id)

  db.prepare("UPDATE cars SET status = 'available' WHERE id = ?").run(order.car_id)

  logAction(req.employee.id, 'ORDER_RETURNED', 'order', order.id)
  logAction(req.employee.id, 'CAR_STATUS_CHANGED', 'car', order.car_id, { to: 'available' })

  res.json({ message: 'Автомобиль успешно возвращён', returned_at: now })
})

// PUT /api/orders/:id/print
router.put('/:id/print', authMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
  if (!order) return res.status(404).json({ error: 'Заказ не найден' })
  if (!toBool(order.is_saved_to_db)) {
    return res.status(409).json({ error: 'Договор ещё не загружен в базу' })
  }

  const now = getMoscowTime()
  db.prepare('UPDATE orders SET printed_at = ? WHERE id = ?').run(now, order.id)

  logAction(req.employee.id, 'CONTRACT_PRINTED', 'order', order.id)
  res.json({ message: 'Печать договора разрешена', printed_at: now })
})

module.exports = router
