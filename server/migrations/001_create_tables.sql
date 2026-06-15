CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  passport TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  driver_license TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  reg_number TEXT UNIQUE NOT NULL,
  vin TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL,
  price_per_day REAL NOT NULL,
  price_per_hour REAL NOT NULL,
  status TEXT DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  car_id INTEGER NOT NULL,
  duration REAL NOT NULL,
  duration_type TEXT NOT NULL,
  total_cost REAL NOT NULL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  returned_at DATETIME,
  synced INTEGER DEFAULT 1,
  is_saved_to_db INTEGER DEFAULT 1,
  contract_html TEXT,
  client_snapshot_json TEXT,
  car_snapshot_json TEXT,
  printed_at DATETIME,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (car_id) REFERENCES cars(id)
);

CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
