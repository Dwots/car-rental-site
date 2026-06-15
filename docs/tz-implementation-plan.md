# План доведения проекта до ТЗ

Проект уже реализует онлайн-сценарий аренды автомобилей: вход сотрудника, поиск/создание клиента, выбор доступного автомобиля, расчет стоимости, создание заказа, договор со штрих-кодом, поиск и возврат.

Тематика "автомобили" вместо "оборудование" считается допустимой. Ниже перечислены только те требования ТЗ, которых в текущем проекте не хватает или которые реализованы не полностью.

## Что Нужно Добавить

1. Логирование действий сотрудников:
   - оформление заказа;
   - возврат;
   - поиск заказа;
   - поиск клиента по паспорту;
   - изменение статуса автомобиля/заказа.

2. Поля подтверждения сохранения:
   - `orders.synced`;
   - `orders.is_saved_to_db`;
   - желательно `orders.contract_html` или `orders.contract_snapshot_json`, чтобы фиксировать содержимое договора на момент оформления.

3. Запрет печати до подтверждения сохранения договора в БД:
   - кнопка "Печать" заблокирована, пока `is_saved_to_db !== true`;
   - при отсутствии подтверждения показывается текст:
     "Договор еще не загружен в базу. Подключитесь к сети и повторите попытку."

4. Офлайн-режим через IndexedDB:
   - при отсутствии сети заказ сохраняется локально;
   - локальный заказ получает временный `local_id`;
   - `synced = false`, `is_saved_to_db = false`;
   - печать такого договора запрещена;
   - после восстановления сети заказ автоматически отправляется на сервер;
   - после успешного ответа сервера локальная запись обновляется: `synced = true`, `is_saved_to_db = true`, сохраняется серверный `id`.

5. Офлайн-поиск:
   - поиск по номеру заказа должен сначала смотреть сервер;
   - если сервер недоступен, искать в IndexedDB по `server_id` или `local_id`;
   - для несинхронизированных заказов показывать статус "Не загружен в БД".

6. Дополнительная защита данных:
   - сейчас на сервере шифруются паспорт и водительское удостоверение;
   - надо также шифровать телефон и адрес в БД;
   - по ТЗ чувствительные данные нужно дополнительно шифровать перед отправкой на сервер. Минимальный вариант для учебного проекта: добавить фронтовое AES-шифрование полей клиента и серверную расшифровку перед сохранением.

7. Защита от подделки сотрудника:
   - сейчас `employee_id` берется из JWT на сервере, это хорошо;
   - нельзя принимать `employee_id` из тела запроса;
   - все серверные логи должны брать сотрудника только из `req.employee.id`.

## Сервер: Изменения БД

Текущий проект пересоздает учебную SQLite-БД с нуля, поэтому итоговую схему надо держать сразу в:

`server/migrations/001_create_tables.sql`

В базовой схеме должны быть `employees`, `clients`, `cars`, `orders` и `action_logs`.

Для `orders` поля ТЗ должны быть встроены прямо в `CREATE TABLE`:

```sql
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
```

Таблица логов тоже создается сразу:

```sql
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
```

Если нужно пересоздать чистую БД:

```bash
rm server/database.sqlite server/database.sqlite-wal server/database.sqlite-shm
cd server
fnm exec --using=24 npm start
```

После этого сервер создаст новую БД по `001_create_tables.sql` и заново добавит тестового сотрудника/автомобили.

## Сервер: Логирование

Добавить файл:

`server/utils/audit.js`

Пример логики:

```js
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
```

Вызовы добавить:

- `server/routes/orders.js`
  - после создания заказа: `ORDER_CREATED`;
  - после смены автомобиля на `rented`: `CAR_STATUS_CHANGED`;
  - после возврата: `ORDER_RETURNED`;
  - после смены автомобиля на `available`: `CAR_STATUS_CHANGED`;
  - при `GET /api/orders/:id`: `ORDER_SEARCHED`.

- `server/routes/clients.js`
  - при поиске клиента: `CLIENT_SEARCHED`;
  - при создании клиента: `CLIENT_CREATED`.

Во всех случаях брать сотрудника так:

```js
const employeeId = req.employee.id
```

Не брать `employee_id` из тела запроса.

## Сервер: Заказы И Флаг Сохранения

В `POST /api/orders` после успешного `INSERT` возвращать:

```js
res.status(201).json({
  id: result.lastInsertRowid,
  synced: true,
  is_saved_to_db: true,
  ...
})
```

В БД при создании заказа явно писать:

```sql
synced = 1,
is_saved_to_db = 1
```

Если договор сохраняется как HTML, то сервер должен принимать или формировать `contract_html`. Более надежно формировать snapshot на сервере:

- данные клиента;
- данные автомобиля;
- срок;
- стоимость;
- сотрудник;
- дата создания.

Это нужно, чтобы договор не менялся задним числом, если позже изменили телефон клиента или данные автомобиля.

## Клиент: IndexedDB

Добавить модуль:

`client/js/utils/offline-db.js`

Хранилища IndexedDB:

- `pending_orders` - несинхронизированные заказы;
- `cached_orders` - заказы, полученные с сервера или успешно синхронизированные;
- `cached_clients` - клиенты для офлайн-подстановки;
- `cached_cars` - автомобили для офлайн-выбора;
- `offline_logs` - локальные действия, которые надо отправить на сервер.

Минимальная структура `pending_orders`:

```js
{
  local_id: 'local-...',
  server_id: null,
  employee_id: 1,
  client: {...},
  car: {...},
  car_id: 2,
  duration: 3,
  duration_type: 'days',
  total_cost: 24000,
  status: 'active',
  synced: false,
  is_saved_to_db: false,
  created_at: '2026-05-18 16:30:00'
}
```

## Клиент: API-Обертка Для Сети

Сейчас `client/js/api/config.js` просто делает `fetch`. Нужно добавить обработку сетевой ошибки:

```js
try {
  const response = await fetch(...)
} catch (err) {
  throw new Error('Сервер недоступен')
}
```

Для создания заказа в `client/js/pages/new-order.js`:

1. Если `navigator.onLine === true`, пробовать `createOrder`.
2. Если сервер ответил успешно:
   - открыть `contract.html?id=<server_id>`;
   - заказ считается `is_saved_to_db = true`.
3. Если сервер недоступен:
   - сохранить заказ в IndexedDB;
   - открыть `contract.html?local_id=<local_id>`;
   - печать должна быть заблокирована.

## Клиент: Синхронизация

Добавить модуль:

`client/js/utils/sync.js`

Логика:

```js
window.addEventListener('online', syncPendingOrders)
document.addEventListener('DOMContentLoaded', syncPendingOrders)
```

Алгоритм `syncPendingOrders`:

1. Получить все `pending_orders`, где `synced === false`.
2. Для каждого вызвать серверный `POST /api/orders`.
3. Если сервер вернул `id`:
   - записать `server_id`;
   - поставить `synced = true`;
   - поставить `is_saved_to_db = true`;
   - перенести запись в `cached_orders`;
   - удалить из очереди или оставить с флагом `synced = true`.
4. Если синхронизация упала, оставить заказ в очереди.

Важно: если автомобиль уже успели сдать другому клиенту, сервер вернет конфликт. Такой заказ надо показать пользователю как "Ошибка синхронизации: автомобиль уже сдан".

## Клиент: Договор И Печать

В `client/pages/contract.html` заменить прямой вызов:

```html
onclick="window.print()"
```

на кнопку с `id`:

```html
<button class="btn btn-primary btn-print" id="print-btn" disabled>
  Печать
</button>
```

В `client/js/pages/contract.js`:

1. Если открыт `contract.html?id=123`, загрузить заказ с сервера.
2. Если сервер вернул `is_saved_to_db: true`, разблокировать печать.
3. Если открыт `contract.html?local_id=local-...`, загрузить заказ из IndexedDB.
4. Если `is_saved_to_db: false`, оставить печать заблокированной и показать:

```text
Договор еще не загружен в базу. Подключитесь к сети и повторите попытку.
```

5. После успешной синхронизации локального заказа обновить страницу договора или заменить `local_id` на `id`.

Печать должна запускаться только так:

```js
printBtn.addEventListener('click', () => {
  if (!currentOrder.is_saved_to_db) {
    showPrintBlockedMessage()
    return
  }

  window.print()
})
```

## Клиент: Офлайн-Поиск

В `client/js/pages/search.js`:

1. При онлайн-режиме сначала искать через сервер.
2. После успешного поиска сохранять заказ в `cached_orders`.
3. Если сервер недоступен:
   - искать в `cached_orders`;
   - искать в `pending_orders`;
   - если найден локальный несинхронизированный заказ, показывать "Не загружен в БД".

В `client/js/pages/return.js`:

- возврат несинхронизированного заказа не должен отправляться на сервер;
- можно либо запретить возврат до синхронизации, либо поставить локальный статус "return_pending" и синхронизировать позже;
- для простоты и надежности лучше запретить возврат до синхронизации.

## Клиент: Дополнительное Шифрование

Минимальный учебный вариант:

1. Добавить `client/js/utils/crypto.js`.
2. Перед `POST /api/clients` шифровать:
   - passport;
   - phone;
   - address;
   - driver_license.
3. На сервере добавить расшифровку входящих полей.

Практическое замечание: если ключ лежит в JS на фронте, это не настоящая криптографическая защита от пользователя браузера. Но для выполнения формального пункта ТЗ этого обычно достаточно. Лучше указывать в пояснительной записке, что реальная защита передачи данных обеспечивается HTTPS, а дополнительное шифрование добавлено как учебное требование.

## Проверка Работы

### 1. Обычный онлайн-заказ

1. Запустить сервер:

```bash
cd server
npm start
```

2. Открыть:

```text
http://localhost:5000/
```

3. Войти `admin / admin123`.
4. Создать клиента или найти существующего.
5. Выбрать доступный автомобиль.
6. Указать срок.
7. Оформить заказ.

Ожидаемо:

- заказ создан на сервере;
- автомобиль получил статус `rented`;
- договор открылся;
- кнопка печати активна;
- в БД у заказа `synced = 1`, `is_saved_to_db = 1`;
- в `action_logs` есть записи `ORDER_CREATED` и `CAR_STATUS_CHANGED`.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT id, employee_id, status, synced, is_saved_to_db FROM orders ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id FROM action_logs ORDER BY id DESC LIMIT 10;"
```

### 2. Возврат

1. Открыть страницу возврата.
2. Ввести номер активного заказа или просканировать штрих-код.
3. Подтвердить возврат.

Ожидаемо:

- заказ получил статус `returned`;
- автомобиль получил статус `available`;
- в `action_logs` есть `ORDER_RETURNED` и `CAR_STATUS_CHANGED`.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT id, status, returned_at FROM orders ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT id, status FROM cars ORDER BY id;"
```

### 3. Блокировка Печати Для Офлайн-Заказа

1. Открыть приложение.
2. Отключить сервер или сеть.
3. Оформить заказ.
4. Открыть договор по `local_id`.

Ожидаемо:

- заказ сохранен в IndexedDB;
- `synced = false`;
- `is_saved_to_db = false`;
- кнопка "Печать" заблокирована;
- показано сообщение:

```text
Договор еще не загружен в базу. Подключитесь к сети и повторите попытку.
```

Проверка в браузере:

1. DevTools.
2. Application.
3. IndexedDB.
4. Найти базу приложения.
5. Проверить `pending_orders`.

### 4. Автосинхронизация После Восстановления Сети

1. После предыдущего теста снова запустить сервер.
2. Вернуть сеть.
3. Дождаться синхронизации или перезагрузить страницу.

Ожидаемо:

- локальный заказ отправлен на сервер;
- появился серверный `id`;
- `synced = true`;
- `is_saved_to_db = true`;
- печать стала доступна;
- в БД появился заказ;
- в `action_logs` есть запись о синхронизации или создании заказа.

### 5. Офлайн-Поиск

1. В онлайн-режиме открыть несколько заказов, чтобы они попали в `cached_orders`.
2. Отключить сервер.
3. Открыть поиск.
4. Ввести номер ранее кэшированного заказа.

Ожидаемо:

- заказ найден из IndexedDB;
- пользователь видит данные заказа;
- если заказ локальный и не синхронизирован, видно "Не загружен в БД";
- печать для такого заказа заблокирована.

### 6. Проверка Неподделываемости Сотрудника

Отправить запрос на создание заказа с чужим `employee_id` в теле:

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"employee_id":999,"client_id":1,"car_id":1,"duration":1,"duration_type":"days"}'
```

Ожидаемо:

- сервер игнорирует `employee_id: 999`;
- в `orders.employee_id` записан сотрудник из JWT;
- в `action_logs.employee_id` тоже сотрудник из JWT.

### 7. Проверка Защиты Данных В БД

После создания клиента выполнить:

```bash
sqlite3 server/database.sqlite "SELECT passport, phone, address, driver_license FROM clients ORDER BY id DESC LIMIT 1;"
```

Ожидаемо:

- паспорт не хранится открытым текстом;
- телефон не хранится открытым текстом;
- адрес не хранится открытым текстом;
- водительское удостоверение не хранится открытым текстом.

## Минимальный Порядок Реализации

1. Встроить итоговую схему сразу в `server/migrations/001_create_tables.sql`: `action_logs`, `synced`, `is_saved_to_db`, snapshots, `printed_at`.
2. Добавить `server/utils/audit.js`.
3. Встроить логирование в `orders.js`, `clients.js`.
4. Возвращать `synced` и `is_saved_to_db` из API заказа.
5. Переделать кнопку печати в `contract.html` и `contract.js`.
6. Добавить `offline-db.js` на IndexedDB.
7. Добавить сохранение офлайн-заказа в `new-order.js`.
8. Добавить `sync.js` и автосинхронизацию.
9. Добавить офлайн-поиск в `search.js`.
10. Дошифровать `phone` и `address`.
11. Пройти проверки из раздела "Проверка Работы".
