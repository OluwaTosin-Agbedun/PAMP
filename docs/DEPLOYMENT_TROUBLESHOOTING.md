# Deployment Troubleshooting — Vercel Production

Status as of 2026-07-24: the production deployment at `anyimfellows.vercel.app`
returns a raw server error on login (`POST /login` → `500`, error digest
`3594062148` at time of writing) and, before this fix, would have failed the
same way on first dashboard load. This document records what was verified,
what wasn't (and why), and the exact steps to finish the fix once someone
with access to the Vercel dashboard for this project is available.

## What was ruled out (verified from the codebase, no Vercel access needed)

- **No hardcoded local/dev database reference anywhere in source.** Searched
  `lib/`, `app/`, `modules/`, `prisma.config.ts` for `localhost`, `127.0.0.1`,
  `:5432`, `:5433` — zero matches outside documentation. The app reads
  `DATABASE_URL` and `AUTH_SECRET` from `process.env` exclusively
  (`lib/db/prisma.ts`, `lib/auth/auth.config.ts`) — same code path in every
  environment.
- **`.env` was never committed** and is correctly gitignored (`.env*`).
- **Prisma Client generation is already wired into the build**:
  `package.json`'s `"postinstall": "prisma generate"` runs automatically on
  Vercel's default `npm install` step. No change needed here.
- **Auth framework confirmed**: Auth.js v5 (`next-auth@^5.0.0-beta.31`),
  Credentials provider, JWT sessions. The required secret variable is
  `AUTH_SECRET` — **not** `NEXTAUTH_SECRET` (the v4 name). `AUTH_TRUST_HOST`
  is explicitly **not needed on Vercel** (see
  [`ENVIRONMENT_CONFIGURATION.md`](ENVIRONMENT_CONFIGURATION.md)) — Vercel
  sets host trust automatically.

## What could not be determined (requires Vercel/database-provider dashboard access)

None of the following were reachable from this environment — no Vercel CLI
session could be established (device-authorization codes expired before
approval), and this machine has no other credentials for the project:

1. Whether a hosted PostgreSQL database (Neon, Supabase, Vercel Postgres,
   etc.) has been provisioned for this project at all.
2. What `DATABASE_URL` is currently set to in Vercel's Production
   environment (if anything).
3. Whether `AUTH_SECRET` is set for Production.
4. The actual Vercel Runtime Log line behind error digest `3594062148` —
   this would immediately confirm the exact failure (connection refused,
   auth failure, missing env var, etc.) instead of requiring guesswork.
5. Whether `prisma migrate deploy` has ever been run against the production
   database, or whether it has any data/schema at all.

## Required repair sequence (once dashboard access is available)

1. **Confirm/provision a hosted PostgreSQL database.** If none exists yet,
   create one (Neon, Supabase, Vercel Postgres, Railway, Render, or Azure
   Database for PostgreSQL all work unmodified — this codebase has no
   provider-specific code). Use the provider's **pooled** connection string
   for `DATABASE_URL` (serverless functions open many short-lived
   connections) and, if the provider distinguishes one, the **direct**
   connection only for `DIRECT_URL`/migrations.
2. **Set Vercel Production environment variables**:
   - `DATABASE_URL` — the hosted provider's pooled connection string, with
     SSL as the provider requires. Must not contain `localhost`,
     `127.0.0.1`, `pam_p_fms_dev`, or `pam_p_app` (the developer's local
     database).
   - `AUTH_SECRET` — generate a fresh value with `openssl rand -base64 32`;
     do not reuse the local development value. Rotating this later
     invalidates every existing session.
   - Leave `AUTH_TRUST_HOST` unset (Vercel doesn't need it).
3. **Trigger a fresh deployment** (environment-variable changes don't apply
   to an already-built deployment) — redeploy without build cache for this
   first corrected build.
4. **Apply migrations to the hosted database** — from a machine that can
   reach it, with `DATABASE_URL` pointed at the hosted instance:
   ```bash
   npx prisma migrate deploy
   ```
   There are 22 committed migrations; confirm all 22 apply cleanly. Never
   run `prisma migrate reset` or `prisma db push --force-reset` against it.
5. **Bootstrap the System Administrator and required system data** — same
   connection, then:
   ```bash
   SEED_ADMIN_NAME="..." SEED_ADMIN_EMAIL="..." SEED_ADMIN_PASSWORD="..." npm run db:seed
   ```
   `prisma/seed.ts` is idempotent, upsert-based, and creates only: the
   System Administrator account, the Programme/active Cohort, the
   Application Review framework, Interview criteria, and notification
   templates. It never deletes anything and never inserts mock applicants
   — safe to run against a fresh production database.
6. **Verify**: login with the seeded administrator account, confirm the
   dashboard loads, then check Runtime Logs are free of `ECONNREFUSED`,
   `P1001`, `P1000`, `P1013`, and `MissingSecret`.

## What this fix already changed (no Vercel access required)

Independent of the above — which needs dashboard access this session didn't
have — the application previously had **no error boundary anywhere**, so a
database-connectivity failure crashed the login action and every dashboard
page with Next.js's generic, unbranded "This page couldn't load" screen.
Added:

- `app/(auth)/login/actions.ts` — the login Server Action's catch block
  only recognized `next-auth`'s own `AuthError` type; any other exception
  (e.g. a raw Prisma connection error) fell through to an unhandled
  `throw`. Now logs a safe, redacted error (correlation ID, error category,
  request path — never the raw message, which for a Prisma connection
  failure can contain the connection string) and returns "Service
  temporarily unavailable. Please try again shortly." instead of crashing.
- `app/error.tsx` — root error boundary for any other unhandled error
  (covers `(dashboard)/layout.tsx`'s `requireUser()` database check, which
  had no fallback of its own).
- `app/global-error.tsx` — last-resort boundary if the root layout itself
  fails.

These changes make the failure mode graceful for real users and give
whoever has dashboard access a clear, safe log line to search for — they do
not and cannot fix the underlying database connectivity problem, which
requires the steps above.
