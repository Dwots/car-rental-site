# IMPLEMENTATION GUIDE: доведение AutoRent до нового ТЗ

Этот файл описывает рабочий порядок доработки текущего проекта проката автомобилей под новое ТЗ. Тематика автомобилей допустима: `cars` считаются арендуемым оборудованием.

Главное правило: не вставлять фрагменты наугад. После каждого блока нужно запускать проверки из раздела "Проверка".

## 1. Что Должно Получиться

В финальном решении должны работать:

- вход сотрудника и сохранение его `id` в `localStorage`;
- серверное логирование действий сотрудника;
- поиск/создание клиента по паспорту;
- шифрование паспорта, телефона, адреса и водительского удостоверения;
- выбор только доступных автомобилей;
- создание заказа с расчетом стоимости;
- смена статуса автомобиля на `rented`;
- возврат с изменением статуса заказа и автомобиля;
- договор со штрих-кодом;
- запрет печати, пока заказ не подтвержден серверной БД;
- офлайн-заказ через IndexedDB;
- автосинхронизация офлайн-заказов после восстановления сети;
- офлайн-поиск по локальным заказам;
- service worker для кэширования HTML/CSS/JS приложения.

## 2. Серверная Схема

Файл: `server/index.js`

После `initDB()` должен выполняться безопасный патч схемы:

- создать `action_logs`;
- добавить в `orders`:
  - `synced INTEGER DEFAULT 1`;
  - `is_saved_to_db INTEGER DEFAULT 1`;
  - `contract_html TEXT`;
  - `client_snapshot_json TEXT`;
  - `car_snapshot_json TEXT`;
  - `printed_at DATETIME`.

Важно: колонки добавляются через проверку `PRAGMA table_info`, иначе SQLite упадет при повторном запуске.

## 3. Аудит Действий

Файл: `server/utils/audit.js`

Должна быть функция:

```js
logAction(employeeId, action, entityType, entityId, details)
```

Она пишет запись в `action_logs`.

Сотрудник всегда берется только с сервера:

```js
req.employee.id
```

Нельзя принимать `employee_id` из тела запроса.

Логируются минимум:

- `EMPLOYEE_LOGIN`;
- `CLIENT_SEARCHED`;
- `CLIENT_CREATED`;
- `CLIENT_ORDERS_SEARCHED`;
- `ORDER_CREATED`;
- `ORDER_SEARCHED`;
- `ORDER_RETURNED`;
- `CAR_STATUS_CHANGED`;
- `CONTRACT_PRINTED`;
- офлайн-логи после синхронизации через `/api/logs`.

## 4. Маршрут Синхронизации Логов

Файл: `server/routes/logs.js`

Маршрут:

```text
POST /api/logs
```

Принимает:

```json
{
  "logs": [
    {
      "action": "ORDER_CREATED_OFFLINE",
      "entity_type": "order",
      "entity_id": "local-...",
      "details": {},
      "created_at": "..."
    }
  ]
}
```

Сервер записывает эти действия в `action_logs`, но `employee_id` берет из JWT, а не из переданного объекта.

Подключение в `server/index.js`:

```js
app.use('/api/logs', logRoutes)
```

## 5. Клиенты И Шифрование

Файл: `server/routes/clients.js`

Сервер должен:

- принимать зашифрованные или обычные поля;
- через `decrypt(...)` получить plain-значения;
- в БД сохранять через `encrypt(...)`:
  - `passport`;
  - `phone`;
  - `address`;
  - `driver_license`;
- в ответах API возвращать расшифрованные значения;
- логировать поиск и создание клиента.

Файл: `client/js/utils/crypto.js`

Фронт шифрует поля через Web Crypto AES-CBC:

- `passport`;
- `phone`;
- `address`;
- `driver_license`.

Файл: `client/js/api/clients.js`

`createClient(data)` должен отправлять именно зашифрованный `payload`, а не исходный `data`.

Практическое замечание: ключ во фронтовом JS не является настоящей криптографической защитой от пользователя браузера. Для учебного ТЗ это закрывает требование "дополнительного шифрования перед отправкой"; реальная защита передачи должна быть HTTPS.

## 6. Заказы

Файл: `server/routes/orders.js`

Создание заказа:

- берет `employee_id` из `req.employee.id`;
- проверяет существование клиента;
- проверяет, что автомобиль `available`;
- считает стоимость на сервере;
- создает заказ с:
  - `synced = 1`;
  - `is_saved_to_db = 1`;
  - `client_snapshot_json`;
  - `car_snapshot_json`;
- меняет статус автомобиля на `rented`;
- логирует `ORDER_CREATED` и `CAR_STATUS_CHANGED`;
- возвращает полный заказ с данными клиента/автомобиля.

Получение заказа:

- `GET /api/orders/:id`;
- возвращает расшифрованные данные клиента;
- возвращает `synced` и `is_saved_to_db` как boolean;
- логирует `ORDER_SEARCHED`.

Поиск по паспорту:

- `GET /api/orders/by-passport/:passport`;
- ищет клиента по расшифрованному паспорту;
- возвращает клиента и список заказов;
- расшифровывает `phone`, `address`, `passport`, `driver_license`;
- логирует `CLIENT_ORDERS_SEARCHED`.

Возврат:

- `PUT /api/orders/:id/return`;
- разрешен только для `active`;
- меняет заказ на `returned`;
- возвращает автомобиль в `available`;
- логирует `ORDER_RETURNED` и `CAR_STATUS_CHANGED`.

Печать:

- `PUT /api/orders/:id/print`;
- разрешена только если `is_saved_to_db = 1`;
- пишет `printed_at`;
- логирует `CONTRACT_PRINTED`.

## 7. Базовая API-Обертка

Файл: `client/js/api/config.js`

`apiRequest` должен:

- брать JWT из `localStorage`;
- добавлять `Authorization: Bearer ...`;
- ловить сетевую ошибку и бросать `Error('Сервер недоступен')`;
- обрабатывать `401/403`;
- парсить JSON;
- бросать ошибку сервера через `json.error`;
- возвращать JSON.

Нельзя заменять эту функцию только на `fetch`. Иначе ломается авторизация и весь API.

## 8. IndexedDB

Файл: `client/js/utils/offline-db.js`

База:

```text
autorent_offline
```

Версия:

```text
2
```

Хранилища:

- `pending_orders`, ключ `local_id`;
- `cached_orders`, ключ `id`;
- `cached_clients`, ключ `passport`;
- `cached_cars`, ключ `id`;
- `offline_logs`, ключ `id`.

Нужные функции:

- `savePendingOrder`;
- `getPendingOrder`;
- `getPendingOrders`;
- `deletePendingOrder`;
- `saveCachedOrder`;
- `getCachedOrder`;
- `getCachedOrders`;
- `saveCachedClient`;
- `getCachedClient`;
- `saveCachedCars`;
- `getCachedCars`;
- `saveOfflineLog`;
- `getOfflineLogs`;
- `deleteOfflineLog`.

## 9. Синхронизация

Файл: `client/js/utils/sync.js`

Синхронизация запускается:

```js
window.addEventListener('online', syncPendingOrders)
document.addEventListener('DOMContentLoaded', syncPendingOrders)
```

Алгоритм:

1. Взять все `pending_orders`.
2. Пропустить уже `synced`.
3. Найти клиента на сервере по паспорту.
4. Если клиента нет, создать клиента.
5. Создать заказ на сервере.
6. Получить серверный заказ.
7. Обновить локальный заказ:
   - `server_id`;
   - `id`;
   - `synced = true`;
   - `is_saved_to_db = true`.
8. Сохранить серверный заказ в `cached_orders`.
9. Синхронизировать `offline_logs` через `POST /api/logs`.
10. Отправить событие `order-synced`, чтобы открытый договор мог разблокировать печать.

Если сервер вернул конфликт автомобиля, заказ остается в `pending_orders`, а печать остается заблокированной.

## 10. Новый Заказ

Файл: `client/js/pages/new-order.js`

Страница должна:

- грузить доступные автомобили с сервера;
- сохранять полученные автомобили в `cached_cars`;
- если сервер недоступен, показывать автомобили из `cached_cars`;
- искать клиента онлайн;
- если сервер недоступен, искать клиента в `cached_clients`;
- если клиента нет, дать заполнить форму;
- при офлайн-сохранении клиента положить его в `cached_clients`;
- при онлайн-заказе создать заказ на сервере и открыть `contract.html?id=...`;
- при отсутствии сервера сохранить заказ в `pending_orders` и открыть `contract.html?local_id=...`;
- для локального заказа поставить:
  - `synced = false`;
  - `is_saved_to_db = false`;
  - `local_id`;
  - нормализованные поля `client_name`, `brand`, `reg_number` и т.д., чтобы договор и поиск не показывали `undefined`;
- записать офлайн-лог `ORDER_CREATED_OFFLINE`.

## 11. Договор И Печать

Файл: `client/pages/contract.html`

Кнопка печати должна быть:

```html
<button class="btn btn-primary btn-print" id="print-btn" disabled>
  Печать
</button>
```

Нельзя оставлять `onclick="window.print()"`.

Файл: `client/js/pages/contract.js`

Страница должна:

- поддерживать `?id=...`;
- поддерживать `?local_id=...`;
- загружать серверный заказ через API;
- локальный заказ загружать из IndexedDB;
- если `is_saved_to_db = false`, показывать:

```text
Договор ещё не загружен в базу. Подключитесь к сети и повторите попытку.
```

- при `is_saved_to_db = true` разблокировать печать;
- перед печатью онлайн-заказа вызвать `markOrderPrinted(id)`;
- если договор уже сохранен в БД, но печать происходит офлайн, записать `CONTRACT_PRINTED_OFFLINE`;
- слушать событие `order-synced` и разблокировать печать без ручного перехода на другую страницу.

## 12. Поиск

Файл: `client/js/pages/search.js`

По номеру заказа:

1. Если есть сервер, искать через `GET /api/orders/:id`.
2. Успешный результат сохранять в `cached_orders`.
3. Если сервер недоступен, искать в:
   - `cached_orders`;
   - `pending_orders`.
4. Для локального заказа показывать "Не загружен в БД".

По паспорту:

1. Если есть сервер, искать через `/api/orders/by-passport/:passport`.
2. Успешные заказы сохранять в `cached_orders`.
3. Если сервер недоступен, искать в:
   - `cached_orders`;
   - `pending_orders`.
4. Логировать офлайн-поиск в `offline_logs`.

Поле поиска заказа не должно удалять буквы и дефис, потому что локальный `local_id` имеет вид:

```text
local-...
```

## 13. Возврат

Файл: `client/js/pages/return.js`

Возврат без сервера запрещен:

- показать сообщение "Возврат недоступен без подключения к серверу";
- записать офлайн-лог `RETURN_BLOCKED_OFFLINE`.

Статус заказа/автомобиля меняется только на сервере, чтобы не получить конфликт состояний.

## 14. Service Worker

Файлы:

- `client/sw.js`;
- `client/js/utils/sw-register.js`.

Service worker кэширует:

- HTML-страницы;
- CSS;
- клиентские JS-файлы.

API-запросы `/api/...` не кэшируются и всегда идут в сеть. Офлайн-данные приложения живут в IndexedDB, а не в service worker cache.

На страницах подключается:

```html
<script src="../js/utils/sw-register.js"></script>
```

## 15. Порядок Подключения Скриптов

На рабочих страницах порядок важен:

1. `storage.js`;
2. `auth-guard.js`;
3. `format.js`;
4. `api/config.js`;
5. `utils/crypto.js`;
6. `api/clients.js`;
7. `api/orders.js`;
8. `utils/offline-db.js`;
9. `utils/sync.js`;
10. `utils/sw-register.js`;
11. скрипт конкретной страницы.

Для `new-order.html` также нужен `api/cars.js`.

## 16. Проверка

### 16.1. Синтаксис

```bash
cd /home/kirill/Документы/VSCODE2/JavaScript/car-rental-app
for f in server/index.js server/routes/*.js server/utils/*.js server/middleware/*.js client/sw.js client/js/api/*.js client/js/pages/*.js client/js/utils/*.js; do
  node --check "$f" || exit 1
done
```

### 16.2. Запуск

```bash
cd server
fnm use 24
npm start
```

Открыть:

```text
http://localhost:5000/
```

Войти:

```text
admin / admin123
```

### 16.3. Проверка API

Логин:

```bash
curl -sS -X POST http://127.0.0.1:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"admin123"}'
```

Проверить, что есть `token` и `employee.id`.

### 16.4. Онлайн-Заказ

1. Найти или создать клиента.
2. Выбрать доступный автомобиль.
3. Указать срок.
4. Оформить заказ.
5. Открыть договор.

Ожидаемо:

- договор открыт по `?id=...`;
- кнопка "Печать" активна;
- автомобиль стал `rented`;
- заказ имеет `synced = 1`, `is_saved_to_db = 1`;
- в `action_logs` есть `ORDER_CREATED`.

SQL:

```bash
sqlite3 server/database.sqlite "SELECT id, status, synced, is_saved_to_db, printed_at FROM orders ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id FROM action_logs ORDER BY id DESC LIMIT 10;"
```

### 16.5. Печать

1. Открыть договор серверного заказа.
2. Нажать "Печать".

Ожидаемо:

- открывается системный диалог печати;
- `orders.printed_at` заполнен;
- в `action_logs` есть `CONTRACT_PRINTED`.

### 16.6. Офлайн-Заказ

1. Открыть страницу нового заказа онлайн, чтобы закэшировать приложение и автомобили.
2. Остановить сервер или включить offline в DevTools.
3. Создать заказ.

Ожидаемо:

- заказ открыт как `contract.html?local_id=...`;
- кнопка "Печать" заблокирована;
- показано сообщение о том, что договор не загружен в базу;
- в DevTools → Application → IndexedDB есть запись в `pending_orders`;
- есть запись в `offline_logs`.

### 16.7. Синхронизация

1. Включить сервер/сеть обратно.
2. Открыть любую рабочую страницу или дождаться события `online`.

Ожидаемо:

- локальный заказ получает `server_id`;
- `synced = true`;
- `is_saved_to_db = true`;
- печать договора разблокируется;
- заказ появляется в SQLite;
- офлайн-логи уходят в `action_logs`.

### 16.8. Офлайн-Поиск

1. Создать или открыть заказ онлайн, чтобы он попал в `cached_orders`.
2. Отключить сервер.
3. Найти заказ по номеру или `local_id`.

Ожидаемо:

- заказ отображается из IndexedDB;
- для несинхронизированного заказа видно "Не загружен в БД";
- поиск по паспорту смотрит локальные `cached_orders` и `pending_orders`.

### 16.9. Возврат

Онлайн:

- возврат активного заказа меняет заказ на `returned`;
- автомобиль становится `available`;
- в логах есть `ORDER_RETURNED` и `CAR_STATUS_CHANGED`.

Офлайн:

- возврат запрещен;
- показывается сообщение;
- пишется `RETURN_BLOCKED_OFFLINE`.

## 17. Частые Ошибки

1. Не заменять весь `apiRequest` только на `fetch`: сломается JWT и JSON.
2. Не использовать `employee_id` из клиента: только `req.employee.id`.
3. Не оставлять `onclick="window.print()"`: печать должна идти через проверку `is_saved_to_db`.
4. Не хранить офлайн-заказ только в `localStorage`: по ТЗ нужен IndexedDB.
5. Не забывать подключать `offline-db.js` до страниц, где используются `savePendingOrder`, `getPendingOrders`, `saveOfflineLog`.
6. Не искать локальный заказ только по числам: `local_id` содержит буквы и дефис.
7. Не кэшировать `/api/...` в service worker: API должен отражать состояние сервера.
8. Если старые клиенты создавались с другим `ENCRYPT_KEY`, их паспорт/права невозможно корректно расшифровать без старого ключа. Для демонстрации создавайте новые записи после настройки текущего ключа.
