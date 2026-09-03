# Driving the real app locally

The point of this is always the same: see what a user would actually see, not what the
code implies they'd see. Read this before an audit, and again before verifying fixes.

Note: `server/README.md` currently describes the database as SQLite/`better-sqlite3`.
That's stale — the running code (`server/src/db.ts`) talks to **Postgres** through `pg`,
matching `DEPLOY.md`'s Supabase-Postgres setup. Follow what's below and in `DEPLOY.md`,
not that paragraph of the README.

## 1. Get a Postgres reachable

You need a `DATABASE_URL` pointing at a real Postgres instance — local, a container, or a
scratch Supabase project. If nothing's running yet, start whatever Postgres is available
in the current environment and create a database for this. There's nothing
Velora-specific about this step; any reachable Postgres works.

## 2. Configure and seed

```bash
cd server
npm install
cp .env.example .env   # or export the same vars directly — DATABASE_URL, JWT_SECRET,
                        # JWT_REFRESH_SECRET at minimum; everything else degrades to a
                        # documented no-op when unset (see .env.example's comments)
npm run seed            # idempotent — safe to rerun. Creates the instrument catalog,
                         # seed prices, and three demo accounts if they don't already
                         # exist:
                         #   admin@velora.local   / AdminPass2026
                         #   manager@velora.local / ManagerPass2026
                         #   trader@velora.local  / TraderPass2026
```

If login with one of those fails, don't read it as an auth regression before checking
whether a *previous* local session manually changed that account's password for its own
testing (a real thing that has happened in this project) — check/reset the row in
Postgres rather than chasing a phantom bug.

## 3. Run the API and confirm it's healthy

```bash
npm run dev   # or `npm run start` for a non-watching run — either serves :4000
curl -s http://localhost:4000/api/health
```

Then the smoke suite, from the same `server/` directory, in a separate terminal once the
API is up:

```bash
npm run smoke
```

It prints a pass/fail count for a full scenario suite (auth, trading, admin, CRM, and
more). A green baseline *before* you start editing is what makes a red result after your
change trustworthy — run it once at the start of an audit that will touch any backend
code, not just at the end.

**Two environment gotchas seen in this project, both specific to a sandboxed/ephemeral
container — skip this paragraph on a normal machine:**

- **Login rate limiting** (`/api/auth/login`, `/register`) is in-memory per API process.
  Manually logging in and out repeatedly while auditing will trip it (`RATE_LIMITED`).
  This is not a bug to fix — just restart the API process to clear it before the next
  round of manual testing or before re-running smoke.
- **Stale price feed.** If the container's clock has jumped forward relative to when
  prices were last fetched (common after a long-idle sandbox resumes), and the sandbox
  has no real network path to Binance, `quoteIsFresh()` will correctly call every quote
  stale and block anything trading-related (`STALE_PRICE`) — this is the platform's
  actual, correct behavior (see `server/README.md`'s "Что происходит, когда котировки
  недоступны" section), not a bug. To unblock local trading-flow testing only, nudge the
  timestamps directly: `UPDATE price_snapshots SET updated_at = now();`. **Never** do
  this against a real deployment's database — there it would paper over a genuinely dead
  feed.

## 4. Build and serve the frontend

```bash
cd frontend
npm install
npm run build     # tsc -b && vite build
npm run preview    # serves the built dist/ — closer to what a real deploy serves
                    # than `npm run dev`'s HMR server, which matters when the audit
                    # is specifically about what a user sees
```

`vite preview` defaults to `http://127.0.0.1:4173` unless configured otherwise — check the
actual port it prints. The frontend's API base defaults to
`http://<hostname>:4000` (`frontend/src/lib/api.ts`), so no extra wiring is needed once
the API from step 3 is up.

## 5. Screenshot the real thing

Use a real browser, not a description of one. Check whether this session's environment
already has a browser wired up for Playwright (some environments document a pre-installed
Chromium and a matching `PLAYWRIGHT_BROWSERS_PATH` — check the current session's system
prompt/environment notes first). If not, install `playwright-core` (a scratch/temp
install is fine, this doesn't need to live in the repo) and point it at whatever Chromium
binary is available.

Minimum viable script shape — desktop and the project's mobile breakpoint (390px, per
`useIsMobile`'s 860px cutoff):

```js
import { chromium } from "playwright-core"; // or the resolved path to it

const browser = await chromium.launch({ executablePath: "<resolved chromium path>" });
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport, hasTouch: viewport.width < 500 });
  await page.goto("http://127.0.0.1:4173/login", { waitUntil: "networkidle" });
  // ...log in with a demo account, navigate to the screen(s) in scope...
  await page.screenshot({ path: `audit-${viewport.width}.png` });
}
await browser.close();
```

Log in with whichever demo account matches the role the screen needs (manager for
`/crm`, admin for `/admin`). For a finding or a fix that's specifically about an *empty*
state, don't skip it because seed data makes every screen look populated — either use a
fresh account/lead with nothing on it yet, or read the empty-state branch in the
component and force it (e.g. filter to something with zero results) so you're looking at
what a real first-time state renders, not assuming from the code that it's fine.

Run `references/contrast-check.js` (paste into the DevTools console) on every screen
you screenshot, in both themes.
