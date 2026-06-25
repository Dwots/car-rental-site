const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const db = require('./db')
const bcrypt = require('bcryptjs')

const authRoutes = require('./routes/auth')
const clientRoutes = require('./routes/clients')
const carRoutes = require('./routes/cars')
const orderRoutes = require('./routes/orders')
const logRoutes = require('./routes/logs')

const app = express()

app.use(cors({ origin: '*' }))
app.use(express.json())

app.get('/', (req, res) => {
  res.redirect('/pages/login.html')
})

app.get('/favicon.ico', (req, res) => {
  res.status(204).end()
})

// Чтобы раздавать фронтенд
app.use(express.static(path.join(__dirname, '../client')))

app.use('/api/auth', authRoutes)
app.use('/api/clients', clientRoutes)
app.use('/api/cars', carRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/logs', logRoutes)

// Создать таблицы и заполнить тестовыми данными
function initDB() {
  const fs = require('fs')
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations/001_create_tables.sql'),
    'utf8'
  )
  db.exec(sql)

  // Добавить тестового сотрудника если нет
  const existing = db.prepare('SELECT * FROM employees WHERE login = ?').get('admin')
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10)
    db.prepare(
      'INSERT INTO employees (login, password_hash, full_name) VALUES (?, ?, ?)'
    ).run('admin', hash, 'Иванов Иван Иванович')
    console.log('✅ Тестовый сотрудник создан: admin / admin123')
  }

  // Добавить тестовые автомобили если нет
  const carsCount = db.prepare('SELECT COUNT(*) as count FROM cars').get()
  if (carsCount.count === 0) {
    const cars = [
      ['BMW', 'M5', 2022, 'А123БВ77', 'WBS83CH0XPC123456', 'Чёрный', 15000, 800, 'available'],
      ['Mercedes', 'E-Class', 2021, 'В456ГД77', 'WDD2130421A123456', 'Белый', 12000, 600, 'available'],
      ['Toyota', 'Camry', 2023, 'Г789ЕЖ77', 'JTDBL40E299123456', 'Серебристый', 8000, 400, 'available'],
      ['Audi', 'A6', 2022, 'Д012ЗИ77', 'WAUZZZ4G8DN123456', 'Синий', 13000, 700, 'available'],
      ['Kia', 'Rio', 2023, 'Е345КЛ77', 'Z94CB41CARG123456', 'Красный', 4000, 200, 'available'],
      ['Hyundai', 'Solaris', 2022, 'Ж678МН77', 'Z94G241DARG123456', 'Белый', 3500, 180, 'rented'],
    ]
    const insert = db.prepare(
      'INSERT INTO cars (brand, model, year, reg_number, vin, color, price_per_day, price_per_hour, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    cars.forEach(car => insert.run(...car))
    console.log('✅ Тестовые автомобили добавлены')
  }
}

initDB()

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`)
})
