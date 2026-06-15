const crypto = require('crypto')
require('dotenv').config()

const ALGORITHM = 'aes-256-cbc'
const KEY = Buffer.from(process.env.ENCRYPT_KEY.padEnd(32).slice(0, 32))

function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  let encrypted = cipher.update(String(text), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(text) {
  try {
    const [ivHex, encrypted] = text.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    return text
  }
}

module.exports = { encrypt, decrypt }
