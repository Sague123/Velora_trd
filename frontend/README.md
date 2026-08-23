# Velora — Frontend

Профессиональный trading terminal (React + TypeScript + Vite), работающий поверх
существующего backend в `../server`. Плотный тёмный (и светлый) UI в духе крупных
бирж: market watch, собственный canvas-график с индикаторами и реальными свечами
Binance, live-стакан, ордер-энтри, торговые сигналы, боты, богатый Overview,
Profile с кошельком и историей баланса, admin-консоль. Полностью адаптирован под
мобильные экраны.

## Запуск

```bash
cd server && npm run dev        # http://localhost:4000 (должен быть запущен первым)
cd frontend && npm install
npm run dev                     # http://localhost:5173
```

`.env` уже указывает `VITE_API_URL=http://localhost:4000` — backend разрешает CORS
именно для `http://localhost:5173` (см. `server/.env`).

Тестовые аккаунты (из `server/README.md`):

| Роль  | Email                 | Пароль          |
|-------|-----------------------|-----------------|
| ADMIN | admin@velora.local    | AdminPass2026   |
| USER  | trader@velora.local   | TraderPass2026  |

## Что реально, а что честно помечено

Всё в интерфейсе — реальные вызовы Velora API (`/api/*`, `/ws/prices`) или реальные
публичные данные Binance (свечи и стакан). Ничего не подделывается.

- **График** — собственный canvas-движок (`lib/chartEngine.ts`), без сторонних
  библиотек и без чьей-либо атрибуции. Свечи для крипто SPOT/PERP — напрямую с
  публичного Binance klines API (реальные, без лимитов CoinGecko); для FX/CFD, где
  у Binance нет пары, используется свечной эндпоинт самого Velora (с той же честной
  пометкой "модельные данные", если апстрим недоступен).
- **Order Book** — реальный публичный стакан Binance для крипто SPOT/PERP. Для
  FX/CFD стакана физически нет ни у Binance, ни у Velora — вкладка так и пишет:
  "Стакан не поддерживается для {symbol}", без выдуманных уровней.
- **Technical Signals / прогноз по паре** — Strong Buy…Strong Sell плюс шкала
  вероятности считаются на фронтенде из реальных свечей (SMA20/50, EMA9/21, RSI14,
  MACD) — механическая сводка индикаторов, не инвестсовет и не ML.
- **Grid Bot — AI-подсказка диапазона** — кнопка "Suggest Range" считает ATR(14) по
  реальным свечам и предлагает диапазон ±2.5×ATR и число уровней; это прозрачная
  индикаторная эвристика, а не фактическая нейросеть, и превью сразу рисует
  предложенные уровни на графике символа.
- **Grid Bot / Martingale** (`/strategies`) — реальные ордера через `/api/orders`,
  исполняются циклом на фронтенде каждые 8с **только пока открыта вкладка** — у
  демо-бэкенда нет отдельного движка автоторговли. Grid держит реальные resting
  LIMIT-ордера и переставляет их при исполнении; Martingale управляет группой
  реальных позиций (бэкенд не усредняет позиции в одну).
- **Copy trading — не реализован.** У Velora API нет публичной ленты сделок других
  пользователей — показывать это как рабочую фичу значило бы подделывать данные.
- **News → Market Movers/Signals** — интеграции с investing.com нет (нет публичного
  API, скрейпинг с фронтенда невозможен и это против ToS). Overview вместо новостей
  считает top gainers/losers и технические сигналы из живых данных Velora.
- **Wallet: Deposit / Withdraw / Transfer** (Profile + Overview) — настоящие новые
  эндпоинты `/api/account/{deposit,withdraw,transfer}` на бэкенде (см. ниже),
  двигающие деньги через тот же `postLedger()`, что и весь остальной леджер. Это
  виртуальный демо-баланс, не реальные платежи.
- **Cash Balance History** (Profile) — реальный график из `/api/ledger`
  (`balanceAfter` во времени, 7D/1M). Это кэш-баланс, не эквити — маржа и открытый
  PnL сюда не входят, график так и подписан.
- **Username change** — настоящий `PATCH /api/auth/me`. Email менять нельзя (это
  логин-идентификатор), UI это не предлагает.
- **KYC-верификация — не реализована** по решению пользователя: загрузка/обработка
  документов даже в демо — чувствительная зона, раздел сознательно не добавлялся.
- **My Recent Fills / Trade History** — `/api/trades`, ваши настоящие исполнения.
- **CFD-инструменты** идут с `source: SYNTHETIC` от самого бэкенда (нет бесплатного
  фида) — фронтенд просто показывает этот бейдж.
- **Settings** — локальные UI-предпочтения (leverage/amount-mode/таймфрейм по
  умолчанию, подтверждение ордера, **тема dark/light**) в localStorage, на сервер
  не уходят.

## Новые backend-эндпоинты этой итерации

Минимальные, следуют существующим паттернам (`postLedger`, `tx`, `audit`) —
не переписывают движок:

```
POST  /api/account/deposit    { amount, note? }             — self top-up (капнуто)
POST  /api/account/withdraw   { amount, note? }              — self cash-out
POST  /api/account/transfer   { toEmail, amount, note? }     — между двумя аккаунтами Velora
PATCH /api/auth/me            { name }                       — смена username
```

Добавлены ledger-типы `TRANSFER_OUT`/`TRANSFER_IN` (у `ledger_entries.type` в схеме
нет CHECK-constraint, так что это чисто аддитивное изменение).

## Структура

```
src/
  lib/         api-клиент (JWT+refresh), chartEngine (свой canvas-чарт), indicators
               (SMA/EMA/RSI/MACD/ATR), signal (рейтинг+вероятность), gridSuggestion,
               binance (klines+depth), strategyEngine, форматирование
  store/       zustand: auth, live-цены (WS), toasts, terminal, settings, strategies, theme
  hooks/       react-query хуки поверх REST + useChartBars, useIsMobile, useStrategyEngineRunner
  components/
    layout/    верхняя панель (nav, hamburger на мобильном, theme toggle, account menu)
    terminal/  market watch (со сворачиванием), canvas-график, order book (Binance),
               ордер-энтри, таблицы, alerts-таб, мобильный layout с нижними табами
    overview/  SignalCard (рейтинг + вероятностный слайдер)
    profile/   WalletActions (deposit/withdraw/transfer), BalanceChart (7D/1M)
    strategies/ GridPreviewChart (свечи + реальные/предложенные уровни сетки)
    admin/     users/audit/instruments для ADMIN
    common/    toast, tooltip, resizer, loading/error/empty states
  pages/       Overview (hero+wallet+сигналы), Terminal, Markets, Orders, Strategies,
               Profile (Profile & Wallet / Portfolio / Security), Settings, Admin,
               Login/Register
```

Portfolio и Alerts как отдельные страницы убраны по запросу: Portfolio теперь вкладка
в Profile, Alerts — вкладка в нижней панели терминала. Старые `/portfolio` и
`/alerts` остаются рабочими редиректами на новые места.

## Тема

`store/theme.ts` + CSS-переменные в `styles/globals.css` (`--c-*`, читаются через
`rgb(var(--c-x) / <alpha-value>)` в tailwind.config.js) — переключение на
`[data-theme="light"]` перекрашивает все существующие Tailwind-классы без правок
компонентов. Переключатель — в TopBar (значок 🌙/☀️) и в Settings.

## Мобильная адаптация

Ниже 860px `TerminalPage` рендерит `MobileTerminal` — нижние табы
(Chart/Book/Trade/Orders/Watch) вместо resizable-сетки; `TopBar` сворачивает
навигацию в гамбургер-меню. Остальные страницы адаптивны через flex-wrap/grid и
горизонтальный скролл таблиц.

## Известное ограничение admin UI

`GET /api/instruments` отдаёт только активные инструменты (`WHERE active = 1`).
Поэтому кнопка «Active» в Admin → Instruments может выключить инструмент (он
пропадёт из списка), но включить обратно через тот же список эндпоинт не даст —
это ограничение самого API, не фронтенда (см. примечание под таблицей в UI).

## Каталог инструментов

`server/src/seed.ts` расширен с 11 до 26 инструментов (BNB, XRP, ADA, DOGE, AVAX,
LINK, DOT, LTC, TRX в SPOT, ещё 2 PERP, AUDUSD/USDCHF в FX, XAGUSD/US100 в CFD) —
все с реальными котировками через тот же CoinGecko/ECB механизм. Чтобы применить на
новой БД: `cd server && npm run seed`.
