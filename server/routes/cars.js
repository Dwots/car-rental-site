const express = require('express')
const router = express.Router()
const db = require('../db')
const authMiddleware = require('../middleware/auth')

// GET /api/cars
router.get('/', authMiddleware, (req, res) => {
  const { status } = req.query
  let cars

  if (status) {
    cars = db.prepare('SELECT * FROM cars WHERE status = ?').all(status)
  } else {
    cars = db.prepare('SELECT * FROM cars').all()
  }

  res.json(cars)
})

// GET /api/cars/available
router.get('/available', authMiddleware, (req, res) => {
  const cars = db.prepare(
    "SELECT * FROM cars WHERE status = 'available'"
  ).all()
  res.json(cars)
})

// GET /api/cars/:id
router.get('/:id', authMiddleware, (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id)
  if (!car) return res.status(404).json({ error: 'Автомобиль не найден' })
  res.json(car)
})

module.exports = router
  