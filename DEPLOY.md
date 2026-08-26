# Deploying Velora

Two services (API + static frontend) on Render's free tier, plus a Supabase Postgres project as the database of record. Everything here is on an always-free tier and upgradeable later without changing anything else.

Render's own free Postgres is **not** used: free instances are deleted 30 days after creation, and that deletion would take the ledger — the money journal every balance is derived from — with it. Supabase's free tier has no such expiry, so `DATABASE_URL` points there instead.

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

Nothing else in Supabase needs configuring for the core platform. (KYC document storage additionally uses a private Supabase Storage bucket — see step 5.)

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
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | KYC submission is rejected with "storage not configured". Create a **private** bucket named `kyc-documents` (Storage → New bucket → *uncheck* Public) and paste the project URL and the **service role** key — server-only, never shipped to the browser. |
| `RESEND_API_KEY` + `MAIL_FROM` + `PUBLIC_APP_URL` | Verification and password-reset emails are written to the server log instead of sent. |

## 6. Verify

```bash
BASE="https://velora-api-xxxx.onrender.com" npm run smoke
```

from `server/`, or just open the frontend URL and try logging in.

## Known limitations to know about

- **Free web services sleep after 15 minutes idle** and take up to ~30-60s to wake on the next request — the first request after a quiet period will feel slow. This does *not* lose data (that's the database's job now, not the app server's), just a cold start.
- **The database lives outside Render on purpose.** Render's free Postgres is deleted 30 days after creation, which is not a survivable property for a ledger, so `DATABASE_URL` points at Supabase (no expiry on the free tier). The app doesn't care which Postgres it talks to — moving to Neon, RDS or a paid Render instance later is a single env var change plus a `pg_dump`/`pg_restore`.
- **Supabase free projects pause after a week with no traffic** and resume on the next connection (a few seconds), and the free tier's storage/egress caps apply. Nothing is deleted while paused.
- `JWT_SECRET`/`JWT_REFRESH_SECRET` are auto-generated by the Blueprint (`generateValue: true`) — real per-deployment secrets, not the `dev-only-*` placeholders used locally.
