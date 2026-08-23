# Velora — торговый бэкенд

Бэкенд демо-платформы: аутентификация, реальные котировки, торговый движок, леджер и админка с аудитом.

## Запуск

```bash
cd server
npm install
cp .env.example .env      # обязательно поменяй секреты
npm run seed              # создаёт БД, инструменты и двух пользователей
npm run dev               # http://localhost:4000
```

Проверка, что всё живо (в отдельном терминале, сервер должен быть запущен):

```bash
npm run smoke             # 60 проверок сквозного сценария
```

### Тестовые аккаунты

| Роль  | Email                 | Пароль          |
|-------|-----------------------|-----------------|
| ADMIN | admin@velora.local    | AdminPass2026   |
| USER  | trader@velora.local   | TraderPass2026  |

Смени пароли перед любым публичным деплоем.

## Архитектура

```
src/
  config.ts            параметры платформы (комиссия, маржа, TTL токенов)
  db.ts                SQLite + схема + транзакции
  lib/
    money.ts           арифметика на целых числах (scale 1e8)
    ledger.ts          единственная точка изменения баланса + аудит
    auth.ts            хеширование паролей, JWT, ротация refresh-токенов
    errors.ts          типизированные ошибки → HTTP-коды
  engine/
    risk.ts            маржа, ликвидация, PnL, условия срабатывания
    execution.ts       размещение ордеров, открытие и закрытие позиций
    matching.ts        серверный тик: исполнение, TP/SL, ликвидации, алерты
    prices.ts          котировки CoinGecko + ЕЦБ, кэш свечей
  routes/
    auth.ts            регистрация, вход, refresh, смена пароля
    trading.ts         инструменты, свечи, ордера, позиции, счёт, алерты
    admin.ts           пользователи, балансы, вмешательство, аудит
```

### Ключевые решения

**Деньги — целые числа.** Все суммы, цены и количества хранятся как `BigInt`, масштабированные на 1e8. Ни один баланс не проходит через `float`: `0.1 + 0.2` в деньгах недопустимо.

**Леджер как источник истины.** Баланс меняется только через `postLedger()`, который в той же транзакции пишет неизменяемую запись в журнал. Баланс любого счёта восстанавливается суммированием его записей — это делает возможным сверку и разбор инцидентов.

**Синхронные транзакции.** `better-sqlite3` синхронный, поэтому транзакцию физически нельзя разорвать другим `await`. Деньги перемещаются целиком или не перемещаются вовсе.

**Движок на сервере.** Лимитные ордера, стопы и ликвидации срабатывают в серверном цикле каждые 2 секунды — независимо от того, открыта ли у трейдера вкладка.

**Котировки с сервера.** Внешние API вызывает бэкенд: нет CORS-проблем, лимиты запросов централизованы, будущий API-ключ не утечёт в браузер, и все клиенты торгуют против одной цены. Инструменты без бесплатного фида (CFD) помечены `source: SYNTHETIC` — модельное число никогда не выдаётся за реальную котировку.

**Безопасность.** Пароли — bcrypt (12 раундов). Refresh-токены хранятся хешированными и ротируются при каждом использовании; повторное предъявление отозванного токена рвёт все сессии пользователя. Заблокированный аккаунт теряет доступ немедленно, а не по истечении токена. Внутренние ошибки не утекают клиенту.

## API

### Публичные
```
GET  /api/health
GET  /api/instruments
GET  /api/instruments/:symbol/candles?tf=15m|1H|4H|1D|1W
WS   /ws/prices
```

### Аутентификация
```
POST /api/auth/register        { email, password, name? }
POST /api/auth/login           { email, password }
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/change-password { currentPassword, newPassword }
```

### Торговля (Bearer-токен)
```
POST   /api/orders             { symbol, side, type, qty, price?, leverage?, takeProfit?, stopLoss? }
GET    /api/orders?status=NEW|FILLED|CANCELLED|ALL
DELETE /api/orders/:id
GET    /api/positions
PATCH  /api/positions/:id      { takeProfit?, stopLoss? }
POST   /api/positions/:id/close
GET    /api/trades
GET    /api/account
GET    /api/ledger
GET/POST/DELETE /api/alerts
```

### Админка (роль ADMIN)
```
GET    /api/admin/stats
GET    /api/admin/users?search=&status=&page=&pageSize=
GET    /api/admin/users/:id
PATCH  /api/admin/users/:id                              { name?, status?, role? }
POST   /api/admin/users/:id/balance                      { amount, note? }
POST   /api/admin/users/:id/reset-password               { newPassword }
POST   /api/admin/users/:uid/positions/:pid/close
DELETE /api/admin/users/:uid/orders/:oid
GET    /api/admin/audit?action=&targetUserId=
PATCH  /api/admin/instruments/:symbol                    { active?, maxLeverage? }
```

Суммы во всех ответах — строки (`"9222.31"`), чтобы точность не терялась при JSON-сериализации. Отправлять их обратно нужно тоже строками.

## Перед продакшеном

Это демо-платформа с виртуальными деньгами. Если появятся реальные средства, обязательны:

- PostgreSQL вместо SQLite (SQL портируемый, но нужны миграции и репликация)
- HTTPS и `secure`-куки (`NODE_ENV=production` включает это автоматически)
- Реальный market-data провайдер по договору вместо публичных бесплатных API
- 2FA, KYC/AML-процедуры, регуляторные требования вашей юрисдикции
- Внешний мониторинг, алертинг и регулярная сверка леджера с балансами
- Нагрузочное тестирование движка и вынос его в отдельный процесс
