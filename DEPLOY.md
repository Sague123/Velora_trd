# Deploying Velora

Two services (API + static frontend) on Render's free tier, plus a Supabase Postgres project as the database of record. Everything here is on an always-free tier and upgradeable later without changing anything else.

Render's own free Postgres is **not** used: free instances are deleted 30 days after creation, and that deletion would take the ledger — the money journal every balance is derived from — with it. Supabase's free tier has no such expiry, so `DATABASE_URL` points there instead.

> **Already deployed from the original Blueprint?** Its first version provisioned a free Render Postgres and wired `DATABASE_URL` to it automatically. Removing that block from `render.yaml` does **not** change an already-deployed service: `DATABASE_URL` is `sync: false` now, which tells Render to leave whatever value is already in the dashboard — so the service keeps pointing at the Render database until someone changes it by hand, and keeps working right up until Render deletes that database on day 30. Then every deploy fails with `getaddrinfo ENOTFOUND dpg-…` and the data is gone with it.
>
> If `DATABASE_URL` on **velora-api** still starts with `postgres://…@dpg-`, do step 1 below and then paste the Supabase string into the dashboard (step 2.4). A database created this way is empty, so run the seed from step 4 afterwards. Render's free databases have no backups; anything that was in the deleted one is not recoverable from here.

## 0. Push this repo to GitHub

Render deploys from a git repo it can pull from. If this project isn't on GitHub yet:

```bash
git init
git add .
git commit -m "Initial commit"
```

Then create a repo on GitHub (via the website, or `gh repo create`) and push to it.

## 1. Create the Supabase database

1. Sign up at [supabase.com](https://supabase.com) → **New project**. Pick a region close to where you'll run the API and set a strong database password (you'll need it in a moment).
2. Once the project is provisioned: **Project Settings → Database → Connection string**.
3. Copy the **Transaction pooler** string (host `...pooler.supabase.com`, port `6543`). Use this one, not the direct `db.<ref>.supabase.co:5432` string — the pooler is reachable over IPv4, which Render's free tier needs, and it pools connections for a small instance.
4. Substitute your database password for `[YOUR-PASSWORD]` and keep `?sslmode=require` on the end. That whole string is `DATABASE_URL`.

Nothing else in Supabase needs configuring: it holds the database and nothing else. Identity documents are stored on the API server's own disk (see `KYC_DIR` in step 5).

## 2. Deploy the Blueprint

1. Go to the [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the GitHub repo you just pushed.
3. Render reads `render.yaml` at the repo root and shows two services (`velora-api`, `velora-frontend`). Click **Apply**.
4. Open **velora-api** → **Environment** → set `DATABASE_URL` to the Supabase string from step 1 → save.
5. Both services build and deploy. The remaining `sync: false` env vars are still empty — the optional ones can stay that way; the two below cannot.

## 3. Wire the two services together

Each service needs to know the other's URL, which only exists after step 1:

1. Open **velora-api** in the dashboard → copy its URL (`https://velora-api-xxxx.onrender.com`).
2. Open **velora-frontend** → **Environment** → set `VITE_API_URL` to that URL → save (triggers a rebuild).
3. Open **velora-frontend** → copy *its* URL (`https://velora-frontend-xxxx.onrender.com`).
4. Open **velora-api** → **Environment** → set `CORS_ORIGIN` to that URL → save (triggers a redeploy).

If you attach a custom domain to the frontend later, update `CORS_ORIGIN` to match it (comma-separate multiple origins if needed).

## 4. Seed the database

The schema creates itself on first boot (`migrate()` runs automatically), but the instrument catalog and demo accounts don't exist until seeded. From your machine, pointed at the live database:

```bash
cd server
DATABASE_URL="<the Supabase connection string from step 1>" npm run seed
```

This creates the instrument list, seeds starting prices, and creates `admin@velora.local` / `trader@velora.local` demo accounts — **change or remove these before sharing the URL publicly**, the same way the demo credentials were pulled from the login page earlier in this project.

## 5. Optional integrations

Every one of these is safe to leave unset — the feature it powers degrades to a documented no-op rather than breaking the deploy. See `server/.env.example` for the full list with comments.

| Variable | Unset behaviour |
|---|---|
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Errors go to the server log / browser console only. |
| `KYC_DIR` | Identity documents go to `./.kyc-storage` next to the server. Set it to a real data directory (`/var/lib/velora/kyc`) owned by the service user. Created `0700` on first use; files are written `0600`. **Include it in backups — it is not in the database dump.** |
| `RESEND_API_KEY` + `MAIL_FROM` + `PUBLIC_APP_URL` | Verification and password-reset emails are written to the server log instead of sent. |

## 6. Verify

```bash
BASE="https://velora-api-xxxx.onrender.com" npm run smoke
```

from `server/`, or just open the frontend URL and try logging in.

## Process roles (`VELORA_ROLE`)

The API can run as one process or as two, chosen by `VELORA_ROLE`:

| Role | Serves | Runs the engines |
|---|---|---|
| `all` *(default)* | everything | yes |
| `public` | auth, settings, trading, spot, strategies, savings, KYC upload, the one-time support link, the price socket | yes |
| `internal` | auth, settings, the CRM, the admin panel, and the market data their chart picker reads | **no** |

`all` is what local development, the smoke suite and an unsplit deployment
run, so adding the split takes the CRM away from nobody who has not opted in.

The point of `public` is that it does not *carry* the CRM or the admin panel:
a valid manager token asking `/api/crm/meta` there gets 404, not 403, because
the route is not in its table. That holds whatever a proxy in front of it is
configured to do. Run `VELORA_ROLE=public npm run routes` to see what a role
serves, straight from the built app.

> **Exactly one engine-running process per database.** Matching, strategies
> and savings all write money against shared rows: a second process ticking
> them fills resting orders twice and liquidates positions twice, and the
> ledger cannot tell the copies apart afterwards. `internal` starts none of
> them, but two processes both set to `public` (or `all`) would still
> double-tick — the role is a guard against a deployment mistake, not a
> distributed lock. `test/role.test.ts` pins this.

Both processes talk to the same database. That is deliberate: the CRM adjusts
balances, closes positions and converts leads into users *inside the same
transactions* as the trading engine, so splitting the data would mean a
distributed transaction on a money ledger. What gets split is network reach,
not state.

## Known limitations to know about

- **Free web services sleep after 15 minutes idle** and take up to ~30-60s to wake on the next request — the first request after a quiet period will feel slow. This does *not* lose data (that's the database's job now, not the app server's), just a cold start.
- **The database lives outside Render on purpose.** Render's free Postgres is deleted 30 days after creation, which is not a survivable property for a ledger, so `DATABASE_URL` points at Supabase (no expiry on the free tier). The app doesn't care which Postgres it talks to — moving to Neon, RDS or a paid Render instance later is a single env var change plus a `pg_dump`/`pg_restore`.
- **Supabase free projects pause after a week with no traffic** and resume on the next connection (a few seconds), and the free tier's storage/egress caps apply. Nothing is deleted while paused.
- **Identity documents live on the API server's disk**, not in object storage, and have no URL of their own: the bytes leave only through an authenticated admin request (`GET /api/admin/kyc/:id/file/:slot`), which the reviewer's browser renders from a blob. That means the public and internal processes must share a filesystem — one host, or `KYC_DIR` on shared storage — and that `KYC_DIR` needs backing up separately from the database.
- `JWT_SECRET`/`JWT_REFRESH_SECRET` are auto-generated by the Blueprint (`generateValue: true`) — real per-deployment secrets, not the `dev-only-*` placeholders used locally.
