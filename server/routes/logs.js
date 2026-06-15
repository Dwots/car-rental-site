const express = require('express')
const router = express.Router()
const db = require('../db')
const { logAction } = require('../utils/audit')
const authMiddleware = require('../middleware/auth')

// GET /api/logs
router.get('/', authMiddleware, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const logs = db.prepare(`
    SELECT
      l.*,
      e.login as employee_login,
      e.full_name as employee_name
    FROM action_logs l
    LEFT JOIN employees e ON e.id = l.employee_id
    ORDER BY l.id DESC
    LIMIT ?
  `).all(limit)

  res.json(logs.map(log => ({
    ...log,
    details: parseDetails(log.details_json)
  })))
})

// POST /api/logs
// Синхронизация действий, совершенных в офлайн-режиме.
router.post('/', authMiddleware, (req, res) => {
  const { logs } = req.body

  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Передайте массив logs' })
  }

  logs.forEach(log => {
    if (!log || !log.action || !log.entity_type) return

    logAction(
      req.employee.id,
      log.action,
      log.entity_type,
      log.entity_id || null,
      {
        ...(log.details || {}),
        offline_created_at: log.created_at || null,
        source: 'offline-sync'
      }
    )
  })

  res.json({ synced: logs.length })
})

function parseDetails(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

module.exports = router
