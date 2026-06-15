const db = require('../db')

function logAction(employeeId, action, entityType, entityId = null, details = {}) {
  db.prepare(`
    INSERT INTO action_logs (employee_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    employeeId,
    action,
    entityType,
    entityId ? String(entityId) : null,
    JSON.stringify(details)
  )
}

module.exports = { logAction }
