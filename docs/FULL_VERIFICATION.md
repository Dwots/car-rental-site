# Полная Проверка Проекта

Этот файл нужен для финальной проверки проекта AutoRent CRM по новому ТЗ аренды. Тематика автомобилей вместо оборудования допустима: автомобиль считается арендуемым оборудованием.

Проверка построена так, чтобы можно было показать не только UI, но и факты в БД: заказы, статусы, флаги `synced` / `is_saved_to_db`, логи сотрудника, шифрование клиентских данных и офлайн-очередь IndexedDB.

## 1. Подготовка

### 1.1. Включить Node 24

Если `fnm use 24` ругается на переменные окружения, сначала выполнить:

```bash
eval "$(fnm env --use-on-cd --shell zsh)"
fnm use 24
node -v
```

Ожидаемо:

```text
v24.x.x
```

Если не хочется настраивать текущую консоль, можно запускать команды через:

```bash
fnm exec --using=24 <команда>
```

### 1.2. Полностью пересоздать БД

Делать это только если нужны чистые тестовые данные. Команда удалит текущие заказы/клиентов.

```bash
rm -f server/database.sqlite server/database.sqlite-wal server/database.sqlite-shm
```

После следующего запуска сервер заново создаст БД по `server/migrations/001_create_tables.sql`, добавит тестового сотрудника и тестовые автомобили.

### 1.3. Очистить локальные данные браузера

Это важно после офлайн-тестов, чтобы старые записи IndexedDB не мешали проверке.
Если сервер еще не запущен, этот пункт можно выполнить после раздела 2.

Открыть `http://localhost:5000/`, DevTools -> Console и выполнить:

```js
localStorage.clear()
indexedDB.deleteDatabase('autorent_offline')
caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
navigator.serviceWorker?.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()))
```

После этого обновить страницу.

### 1.4. Если При Входе Пишет `The quota has been exceeded`

Это значит, что браузерное хранилище для `localhost` переполнено или сломалось после старых офлайн-тестов. Быстрый способ:

1. Открыть DevTools -> Application.
2. Открыть Storage.
3. Нажать `Clear site data`.
4. Обновить страницу и войти снова.

Альтернатива через Console:

```js
localStorage.clear()
sessionStorage.clear()
indexedDB.deleteDatabase('autorent_offline')
caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
navigator.serviceWorker?.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()))
```

После исправления вход также умеет использовать `sessionStorage`, если `localStorage` временно недоступен.

## 2. Запуск

Из корня проекта:

```bash
cd server
fnm exec --using=24 npm start
```

Или если Node 24 уже активен:

```bash
cd server
npm start
```

Важно: для обычной проверки нужен порт `5000`, потому что фронт ходит к API `http://localhost:5000`.

Открыть:

```text
http://localhost:5000/
```

Ожидаемо:

- открывается страница входа;
- ошибки `Cannot GET /` нет;
- ошибка по `favicon.ico` не мешает работе и не должна появляться как критическая;
- вход работает через `admin / admin123`.

## 3. Проверка Схемы БД

Если установлен `sqlite3`, выполнить из корня проекта:

```bash
sqlite3 server/database.sqlite ".tables"
sqlite3 server/database.sqlite "PRAGMA table_info(orders);"
sqlite3 server/database.sqlite "PRAGMA table_info(action_logs);"
```

Ожидаемо в списке таблиц:

```text
action_logs cars clients employees orders
```

Ожидаемо в `orders` есть поля:

```text
synced
is_saved_to_db
contract_html
client_snapshot_json
car_snapshot_json
printed_at
```

Проверить тестовые данные:

```bash
sqlite3 server/database.sqlite "SELECT id, login, full_name FROM employees;"
sqlite3 server/database.sqlite "SELECT id, brand, model, status FROM cars ORDER BY id;"
```

Ожидаемо:

- есть сотрудник `admin`;
- есть 6 автомобилей;
- часть автомобилей `available`, один тестовый может быть `rented`.

Дополнительно проверить, что больше нет старого runtime-патча таблиц:

```bash
rg -n "applyTzPatch|ApplyTzChanges|ensureColumn|ALTER TABLE orders ADD COLUMN|002_logs" server docs
```

Ожидаемо: команда ничего не выводит.

## 4. Вход Сотрудника И Идентификация

1. Открыть `http://localhost:5000/`.
2. Войти:

```text
login: admin
password: admin123
```

3. Открыть DevTools -> Application -> Local Storage -> `http://localhost:5000`.

Ожидаемо:

- есть `token`;
- есть `employee`;
- внутри `employee` есть `id`, `login`, `full_name`.

Проверить лог входа:

```bash
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, created_at FROM action_logs ORDER BY id DESC LIMIT 5;"
```

Ожидаемо: есть запись `EMPLOYEE_LOGIN` с `employee_id = 1`.

То же самое можно посмотреть в интерфейсе: пункт меню `Журнал`.

## 5. Онлайн-Сценарий Заказа

### 5.1. Создать или найти клиента

На странице оформления заказа ввести новый паспорт, например:

```text
4500123456
```

Если клиент не найден, заполнить форму:

```text
ФИО: Петров Петр Петрович
Телефон: +79990001122
Адрес: Москва, Тестовая 1
Водительское удостоверение: 77 77 123456
```

Ожидаемо:

- новый клиент сохраняется;
- данные клиента подтягиваются в заказ;
- в журнале есть `CLIENT_SEARCHED` и `CLIENT_CREATED`.

Примечание: при поиске нового клиента в Network может быть `GET /api/clients/...` со статусом `404`. Это ожидаемый ответ "клиент не найден", после него открывается форма создания клиента.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT id, full_name, passport, phone, address, driver_license FROM clients ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id FROM action_logs ORDER BY id DESC LIMIT 10;"
```

Ожидаемо:

- `full_name` виден открыто;
- `passport`, `phone`, `address`, `driver_license` не совпадают с введенным текстом и выглядят как зашифрованные строки формата `iv:cipher`;
- в логах есть действия по клиенту.

Проверка через интерфейс:

1. Открыть пункт меню `Журнал`.
2. Проверить последние записи.
3. Найти действия `Поиск клиента` и `Клиент создан`.

### 5.2. Проверить список доступных автомобилей

Открыть оформление заказа и посмотреть выпадающий список автомобиля.

Ожидаемо:

- в списке только автомобили со статусом `available`;
- автомобили со статусом `rented` не предлагаются.

SQL-проверка до создания заказа:

```bash
sqlite3 server/database.sqlite "SELECT id, brand, model, status FROM cars ORDER BY id;"
```

### 5.3. Проверить расчет стоимости

1. Выбрать доступный автомобиль.
2. Выбрать тип срока: дни или часы.
3. Ввести срок, например `2`.

Ожидаемо:

- стоимость на странице меняется без перезагрузки;
- для дней расчет идет как `duration * price_per_day`;
- для часов расчет идет как `duration * price_per_hour`.

### 5.4. Оформить заказ

Нажать кнопку оформления.

Ожидаемо:

- открывается страница договора;
- в договоре есть клиент, автомобиль, срок, стоимость, номер заказа, дата;
- есть штрих-код/код заказа;
- кнопка печати активна, потому что заказ уже сохранен в БД;
- в БД у заказа `synced = 1` и `is_saved_to_db = 1`;
- автомобиль получил статус `rented`;
- в логах есть `ORDER_CREATED` и `CAR_STATUS_CHANGED`.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT id, employee_id, client_id, car_id, duration, duration_type, total_cost, status, synced, is_saved_to_db, printed_at FROM orders ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT id, brand, model, status FROM cars ORDER BY id;"
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id, details_json FROM action_logs ORDER BY id DESC LIMIT 15;"
```

Проверить snapshots договора:

```bash
sqlite3 server/database.sqlite "SELECT id, client_snapshot_json IS NOT NULL AS has_client_snapshot, car_snapshot_json IS NOT NULL AS has_car_snapshot FROM orders ORDER BY id DESC LIMIT 1;"
```

Ожидаемо:

```text
has_client_snapshot = 1
has_car_snapshot = 1
```

Примечание: поле `contract_html` есть в схеме, но текущая реализация фиксирует договор через snapshots клиента и автомобиля. Поэтому `contract_html` может быть `NULL`.

## 6. Проверка Печати Договора

На странице договора нажать `Печать`.

Ожидаемо:

- печать разрешается только если `is_saved_to_db = true`;
- браузер открывает системное окно печати;
- после разрешения печати сервер записывает `printed_at`;
- в логах есть `CONTRACT_PRINTED`.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT id, is_saved_to_db, printed_at FROM orders ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id FROM action_logs ORDER BY id DESC LIMIT 10;"
```

Ожидаемо:

- `printed_at` заполнен;
- есть лог `CONTRACT_PRINTED`.

## 7. Поиск Заказа

### 7.1. Поиск по номеру заказа

1. Открыть страницу поиска.
2. Ввести номер последнего заказа из договора или из SQL.
3. Нажать Enter или кнопку поиска.

Ожидаемо:

- заказ найден;
- отображаются клиент, автомобиль, срок, стоимость, статус;
- в логах есть `ORDER_SEARCHED`.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id FROM action_logs ORDER BY id DESC LIMIT 10;"
```

### 7.2. Поиск по паспорту

1. На странице поиска переключиться на поиск по паспорту, если в UI есть выбор режима.
2. Ввести паспорт клиента, например `4500123456`.

Ожидаемо:

- система показывает заказы этого клиента;
- в логах есть `CLIENT_ORDERS_SEARCHED`;
- поиск работает по расшифрованному паспорту, хотя в БД паспорт хранится зашифрованным.

## 8. Возврат Автомобиля

1. Открыть страницу возврата.
2. Ввести номер активного заказа.
3. Подтвердить возврат.

Ожидаемо:

- заказ получает статус `returned`;
- `returned_at` заполнен;
- автомобиль снова получает статус `available`;
- в логах есть `ORDER_RETURNED` и `CAR_STATUS_CHANGED`.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT id, status, returned_at FROM orders ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT id, brand, model, status FROM cars ORDER BY id;"
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id, details_json FROM action_logs ORDER BY id DESC LIMIT 15;"
```

## 9. Офлайн-Режим

Перед офлайн-проверкой нужно хотя бы один раз открыть приложение онлайн, чтобы service worker и IndexedDB успели инициализироваться.

### 9.1. Подготовить кэш для офлайна

1. При работающем сервере войти в приложение.
2. Открыть страницы:
   - оформление заказа;
   - поиск;
   - договор любого заказа.
3. На странице оформления дождаться загрузки доступных автомобилей.

Ожидаемо:

- в DevTools -> Application -> IndexedDB появляется база `autorent_offline`;
- есть stores:
  - `pending_orders`;
  - `cached_orders`;
  - `cached_clients`;
  - `cached_cars`;
  - `offline_logs`.

### 9.2. Создать офлайн-заказ

Есть два удобных способа:

- DevTools -> Network -> поставить `Offline`;
- или оставить страницу оформления открытой и остановить сервер в терминале через `Ctrl+C`.

После отключения сети:

1. На странице оформления ввести паспорт.
2. Если клиент уже был кэширован, данные подтянутся.
3. Если клиент новый, заполнить форму клиента.
4. Выбрать автомобиль из кэшированного списка.
5. Указать срок.
6. Оформить заказ.

Ожидаемо:

- заказ сохраняется в IndexedDB, а не в SQLite;
- открывается договор с `local_id`;
- у заказа `synced = false`;
- у заказа `is_saved_to_db = false`;
- выбранный автомобиль локально перестает считаться доступным для новых офлайн-заказов;
- кнопка `Печать` заблокирована;
- показано сообщение:

```text
Договор еще не загружен в базу. Подключитесь к сети и повторите попытку.
```

Проверка в браузере:

1. DevTools -> Application -> IndexedDB -> `autorent_offline`.
2. Открыть `pending_orders`.
3. Открыть `offline_logs`.

Ожидаемо:

- в `pending_orders` есть локальный заказ;
- у него есть `local_id`;
- `server_id = null`;
- `synced = false`;
- `is_saved_to_db = false`;
- в `offline_logs` есть локальные действия, например `ORDER_CREATED_OFFLINE`.

SQL-проверка при выключенном сервере не нужна: в SQLite этот заказ еще не должен появиться.

Если сервер был именно остановлен через `Ctrl+C`, а не включен режим Offline в DevTools, страница договора откроется офлайн только после установки service worker. Если service worker еще не управляет вкладкой, приложение оставит пользователя на странице заказа и покажет локальный номер заказа.

## 10. Автосинхронизация После Возврата Сети

1. Вернуть Network в `Online` или снова запустить сервер:

```bash
cd server
fnm exec --using=24 npm start
```

2. Вернуться на страницу приложения.
3. Обновить страницу или дождаться события `online`.

Ожидаемо:

- офлайн-заказ отправляется на сервер;
- в IndexedDB локальный заказ удаляется из `pending_orders`;
- в `cached_orders` появляется серверная копия заказа с обычным `id`;
- `is_saved_to_db = true`;
- страница договора разблокирует печать;
- в SQLite появляется новый заказ;
- офлайн-логи отправляются на сервер в `action_logs`.

Если сервер отклонит синхронизацию из-за автомобиля, который уже занят, локальный заказ остается в IndexedDB с `sync_failed = true`, а в договоре/поиске показывается ошибка синхронизации. Такой договор печатать нельзя, нужно оформить новый заказ на другой автомобиль.

Проверка в браузере:

- DevTools -> Application -> IndexedDB -> `autorent_offline` -> `cached_orders`;
- найти заказ с серверным `id`;
- проверить `synced = true` и `is_saved_to_db = true` у серверной копии заказа.

SQL-проверка:

```bash
sqlite3 server/database.sqlite "SELECT id, employee_id, status, synced, is_saved_to_db, created_at FROM orders ORDER BY id DESC LIMIT 5;"
sqlite3 server/database.sqlite "SELECT action, employee_id, entity_type, entity_id FROM action_logs ORDER BY id DESC LIMIT 20;"
```

Ожидаемо:

- появился новый серверный заказ;
- есть `ORDER_CREATED`;
- есть синхронизированные офлайн-логи.

## 11. Офлайн-Поиск

### 11.1. Поиск кэшированного серверного заказа

1. Онлайн открыть поиск и найти существующий заказ, чтобы он попал в `cached_orders`.
2. Включить DevTools -> Network -> `Offline`.
3. Повторить поиск по этому же номеру заказа.

Ожидаемо:

- заказ находится из IndexedDB;
- показываются данные заказа;
- если заказ уже был сохранен в БД, печать разрешена.

### 11.2. Поиск локального несинхронизированного заказа

1. Создать офлайн-заказ из раздела 9.
2. Пока сервер недоступен, открыть поиск.
3. Ввести его `local_id`.

Ожидаемо:

- заказ находится из `pending_orders`;
- видно, что он еще не загружен в БД;
- печать запрещена.

## 12. Проверка Защиты От Подделки Сотрудника

Смысл проверки: клиент не должен решать, какой `employee_id` попадет в заказ. Сервер должен брать сотрудника только из JWT.

1. Войти в UI как `admin`.
2. Создать клиента и убедиться, что есть доступный автомобиль.
3. Взять токен из DevTools -> Application -> Local Storage -> `token`.
4. Выполнить запрос с фальшивым `employee_id`.

Пример:

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"employee_id":999,"client_id":1,"car_id":1,"duration":1,"duration_type":"days"}'
```

Если `car_id = 1` уже арендован, взять любой `available`:

```bash
sqlite3 server/database.sqlite "SELECT id, brand, model FROM cars WHERE status = 'available' LIMIT 5;"
```

После успешного создания проверить:

```bash
sqlite3 server/database.sqlite "SELECT id, employee_id FROM orders ORDER BY id DESC LIMIT 1;"
sqlite3 server/database.sqlite "SELECT action, employee_id FROM action_logs ORDER BY id DESC LIMIT 5;"
```

Ожидаемо:

- в заказе `employee_id = 1`, а не `999`;
- в логах тоже `employee_id = 1`;
- значит номер сотрудника берется из JWT на сервере.

## 13. Проверка Шифрования Данных

### 13.1. Передача с фронта

1. Открыть DevTools -> Network.
2. Создать нового клиента.
3. Найти запрос `POST /api/clients`.
4. Посмотреть request payload.

Ожидаемо:

- `passport`, `phone`, `address`, `driver_license` отправляются не открытым текстом;
- значения похожи на зашифрованные строки;
- `full_name` может быть открытым, это не паспорт/телефон/адрес.

### 13.2. Хранение в БД

```bash
sqlite3 server/database.sqlite "SELECT passport, phone, address, driver_license FROM clients ORDER BY id DESC LIMIT 1;"
```

Ожидаемо:

- в БД нет открытого паспорта;
- в БД нет открытого телефона;
- в БД нет открытого адреса;
- в БД нет открытого водительского удостоверения;
- значения имеют формат вроде `hex_iv:hex_cipher`.

### 13.3. Расшифровка при работе приложения

1. Найти клиента по паспорту через UI.
2. Найти заказ клиента через UI.

Ожидаемо:

- в интерфейсе данные отображаются нормально;
- значит сервер умеет расшифровывать данные для разрешенных API-запросов.

## 14. Проверка API Без UI

Этот раздел необязательный, но полезен для доказательства, что сервер отвечает корректно.

Получить JWT:

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}'
```

Скопировать `token` из ответа и подставить в следующие запросы.

Проверить доступные автомобили:

```bash
curl -s http://localhost:5000/api/cars/available \
  -H "Authorization: Bearer <TOKEN>"
```

Проверить заказ:

```bash
curl -s http://localhost:5000/api/orders/<ORDER_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

Ожидаемо:

- без токена защищенные API возвращают ошибку авторизации;
- с токеном API возвращает данные;
- в ответе заказа есть `synced: true` и `is_saved_to_db: true`.

## 15. Что Рассказать На Защите

Короткая структура объяснения:

1. Сотрудник входит в систему, сервер выдает JWT, данные сотрудника сохраняются в `localStorage`.
2. Все действия логируются в `action_logs` с `employee_id` из JWT, а не из клиента.
3. Клиент ищется по паспорту. В БД паспорт, телефон, адрес и водительское удостоверение хранятся зашифрованно.
4. В заказ можно выбрать только автомобиль со статусом `available`.
5. После оформления заказа автомобиль становится `rented`, после возврата снова `available`.
6. Стоимость считается автоматически: срок умножается на цену за день или час.
7. Договор открывается после создания заказа. Печать разрешена только при `is_saved_to_db = true`.
8. Если сети нет, заказ сохраняется в IndexedDB как `pending_order`, получает `synced = false` и `is_saved_to_db = false`; печать заблокирована.
9. Когда сеть возвращается, `sync.js` отправляет pending-заказы на сервер, обновляет локальную копию и разблокирует печать.
10. Поиск работает по серверным заказам онлайн и по IndexedDB офлайн.

## 16. Финальный Чек-Лист

Перед сдачей пройти по списку:

- вход `admin / admin123` работает;
- новая БД создается без дополнительных `ALTER TABLE` при запуске;
- `orders` содержит `synced`, `is_saved_to_db`, snapshots и `printed_at`;
- `action_logs` существует;
- новый клиент создается и чувствительные поля в БД зашифрованы;
- список автомобилей показывает только доступные;
- онлайн-заказ создается, автомобиль становится `rented`;
- договор показывает данные заказа;
- печать онлайн-договора разрешена и пишет `printed_at`;
- поиск заказа по номеру работает;
- поиск заказов по паспорту работает;
- возврат меняет заказ на `returned`, автомобиль на `available`;
- офлайн-заказ сохраняется в IndexedDB;
- печать офлайн-заказа заблокирована до синхронизации;
- после восстановления сети заказ появляется в SQLite;
- после синхронизации `synced = 1`, `is_saved_to_db = 1`;
- офлайн-поиск находит кэшированные и локальные заказы;
- попытка подменить `employee_id` не влияет на серверный `employee_id`;
- в `action_logs` есть записи входа, поиска, создания заказа, печати и возврата.
