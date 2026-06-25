Сайт по аренде машин.

## Запуск

```bash
cd server
npm install        # один раз, если ещё не ставил зависимости
npm start          # или npm run dev (с авто-перезапуском)
```

Сервер раздаёт и API, и фронтенд. Открой http://localhost:5000
Тестовый вход: `admin` / `admin123`.

## Ошибка better-sqlite3 при переключении ОС (Arch Linux <-> Windows)

`better-sqlite3` — нативный модуль: внутри лежит скомпилированный
бинарник `better_sqlite3.node` под конкретную ОС и версию Node.
Если `node_modules` собран под одну систему, а запускаешь под другой,
получишь одну из ошибок:

- Windows: `Error: ... better_sqlite3.node is not a valid Win32 application`
- Linux: `Error: ... invalid ELF header` (или похожее)

### Как починить

Нужно пересобрать/переустановить нативный бинарник под текущую ОС:

```bash
cd server
rm -rf node_modules/better-sqlite3
npm install better-sqlite3
```

`npm` сам скачает готовый бинарник под текущую систему. Если готового
бинарника нет (см. ниже), он попробует скомпилировать из исходников —
для этого нужен C/C++ компилятор:

- **Arch Linux:** `sudo pacman -S base-devel python` (gcc + make + python)
- **Windows:** установить Visual Studio Build Tools (компонент "Desktop
  development with C++").

### Важно: версия better-sqlite3 и версия Node

Под текущую Node 20 у `better-sqlite3@12` **нет готовых бинарников**
(только под Node 22+), поэтому npm полезет компилировать. Варианты:

1. Использовать `better-sqlite3@11` (готовые бинарники под Node 20 есть) —
   сейчас в проекте стоит именно так.
2. Либо обновить Node до 22 LTS — тогда можно вернуться на `better-sqlite3@12`
   без компиляции.

Самый надёжный универсальный приём при любом «странном» поведении после
смены ОС — полностью переустановить зависимости:

```bash
cd server
rm -rf node_modules package-lock.json
npm install
```
