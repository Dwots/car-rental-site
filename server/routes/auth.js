const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')
const { logAction } = require('../utils/audit')
require('dotenv').config()

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { login, password } = req.body

  if (!login || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' })
  }

  const employee = db.prepare(
    'SELECT * FROM employees WHERE login = ?'
  ).get(login)

  if (!employee) {
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }

  const isValid = bcrypt.compareSync(password, employee.password_hash)
  if (!isValid) {
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }

  const token = jwt.sign(
    { id: employee.id, full_name: employee.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  )

  logAction(employee.id, 'EMPLOYEE_LOGIN', 'employee', employee.id)

  res.json({
    token,
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      login: employee.login
    }
  })
})

module.exports = router
