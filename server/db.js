const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'), {
  verbose: console.log
})

// Включить WAL режим для производительности
db.pragma('journal_mode = WAL')

module.exports = db
