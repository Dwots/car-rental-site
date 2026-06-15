const jwt = require('jsonwebtoken')
require('dotenv').config()

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Токен не предоставлен' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.employee = decoded
    next()
  } catch {
    return res.status(403).json({ error: 'Токен недействителен' })
  }
}

module.exports = authMiddleware
