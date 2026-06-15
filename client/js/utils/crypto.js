const FRONTEND_ENCRYPT_KEY = 'replace-with-32-chars-minimum-key-123456'

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

async function importKey() {
  const keyBytes = new TextEncoder().encode(FRONTEND_ENCRYPT_KEY.padEnd(32).slice(0, 32))
  return crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt', 'decrypt'])
}

async function encryptText(plainText) {
  const key = await importKey()
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const data = new TextEncoder().encode(String(plainText))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, data)
  return `${toHex(iv)}:${toHex(encrypted)}`
}