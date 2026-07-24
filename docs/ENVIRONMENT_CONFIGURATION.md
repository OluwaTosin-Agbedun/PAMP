# Environment Configuration

All environment variables are declared in [`.env.example`](../.env.example)
— copy it to `.env` for local development. `.env` is gitignored and must
never be committed.

## Variables

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | `lib/db/prisma.ts`, `prisma/seed.ts`, Prisma CLI (via `prisma.config.ts`) | Standard Postgres connection string. Works unchanged against Vercel Postgres/Neon/Supabase, Azure Database for PostgreSQL, AWS RDS, or a local/self-hosted instance — only this value changes between environments. Prisma 7 doesn't read `.env` automatically for the CLI; `prisma.config.ts` explicitly loads it via `dotenv/config`. |
| `AUTH_SECRET` | Yes | Auth.js (JWT encryption) | Generate with `openssl rand -base64 32`. Rotating this invalidates every existing session — treat it like any other secret credential, and inject it via your deploy platform's secret manager rather than a committed file. |
| `AUTH_TRUST_HOST` | Production only (behind a non-Vercel host) | Auth.js | Vercel sets its own host-trust automatically; any other host (self-hosted, another PaaS) needs this set to `true` so Auth.js trusts the incoming `Host` header. Not needed for local dev (`localhost`). |
| `SEED_ADMIN_NAME` | Only for `npm run db:seed` | `prisma/seed.ts` | Display name of the bootstrap System Administrator. |
| `SEED_ADMIN_EMAIL` | Only for `npm run db:seed` | `prisma/seed.ts` | Sign-in email for the bootstrap account. Lower-cased/trimmed the same way `loginSchema` normalizes it, so it matches on first sign-in regardless of casing in `.env`. |
| `SEED_ADMIN_PASSWORD` | Only for `npm run db:seed` | `prisma/seed.ts` | Plaintext only in this env var, at seed time — hashed with `bcrypt` (cost 12) before it ever reaches the database, and never logged or written anywhere else. See [`docs/SEEDING.md`](SEEDING.md) for the full bootstrap security model. |
| `SEED_COHORT_YEAR` | Optional, seed only | `prisma/seed.ts` | Defaults to `2026`. Controls the year label on the bootstrap active `Cohort` row. |
| `MS_GRAPH_TENANT_ID` | Only for Microsoft Teams Interview Integration | `lib/msgraph/client.ts` | The Azure AD (Entra ID) tenant ID the Graph app registration belongs to. |
| `MS_GRAPH_CLIENT_ID` | Only for Microsoft Teams Interview Integration | `lib/msgraph/client.ts` | The Graph app registration's client (application) ID. Needs the `OnlineMeetings.ReadWrite.All`/calendar application permission granted and admin-consented — this app uses the client-credentials flow (app-only), not a signed-in user's token. |
| `MS_GRAPH_CLIENT_SECRET` | Only for Microsoft Teams Interview Integration | `lib/msgraph/client.ts` | The app registration's client secret. Used only to fetch a short-lived access token at request time — the token itself is kept in an in-memory cache only, never written to the database, a log line, or an audit entry. |
| `MS_GRAPH_ORGANISER_UPN` | Only for Microsoft Teams Interview Integration | `lib/msgraph/client.ts` | The UPN (e.g. `interviews@yourtenant.onmicrosoft.com`) of the Microsoft 365 mailbox every synced interview's calendar event is created under — a fixed shared/service mailbox, not any individual FMS user's own account. |
| `MS_GRAPH_MAIL_SENDER_UPN` | Optional — Notification Infrastructure | `lib/msgraph/mailClient.ts` | The mailbox outbound notification email is sent from. Falls back to `MS_GRAPH_ORGANISER_UPN` when unset — most tenants can use the same shared mailbox for both Teams meetings and notification email; set this separately only if yours can't. Needs the `Mail.Send` application permission granted and admin-consented, alongside the calendar permission Teams already uses, on the same app registration. |
| `NOTIFICATIONS_CRON_SECRET` | Only for the scheduled-notifications endpoint | `app/api/cron/process-notifications/route.ts` | A shared secret an external scheduler (Vercel Cron, a GitHub Action, any periodic pinger) presents as a bearer token so the endpoint can't be triggered by an unauthenticated request. This codebase runs no persistent background process — nothing sends a scheduled reminder unless something external calls this endpoint periodically. See [docs/NOTIFICATIONS.md](NOTIFICATIONS.md). |

If any of the four Teams `MS_GRAPH_*` variables is unset, Teams
integration is treated as **not configured**: creating/retrying a Teams
meeting fails clearly (`GraphNotConfiguredError`) rather than silently
doing nothing or fabricating a join link — the pre-existing manual
meeting-link entry remains available as a fallback regardless. See
[docs/TEAMS_INTEGRATION.md](TEAMS_INTEGRATION.md). The same four
variables (plus the optional mail-sender override) also gate whether
Notification Infrastructure can actually deliver email — if unset, a
notification is recorded as `FAILED` with a clear reason rather than
silently doing nothing. See [docs/NOTIFICATIONS.md](NOTIFICATIONS.md).

## Secrets handling

- `.env` is listed in `.gitignore` — verify this hasn't been touched
  before committing anything in a fresh checkout.
- `SEED_ADMIN_PASSWORD`, `AUTH_SECRET`, and `MS_GRAPH_CLIENT_SECRET` are
  the "real secret" values here; each flows into the application exactly
  once (seed script, Auth.js's internal JWT encryption, Microsoft Graph's
  client-credentials token request) and is never echoed back in a log
  line, an audit entry, or an API response. `lib/logging/logger.ts`'s
  `redact()` strips any logged object key matching
  `/password|passwordHash|token|secret|authorization|cookie/i` as a
  defense-in-depth backstop, on top of the discipline of simply never
  passing them to `logger.*` or `writeAuditLog` in the first place.
- In production, set these through your platform's secret manager
  (Vercel Environment Variables, or equivalent), not a checked-in file.
  Nothing in the application code is Vercel-specific — `AUTH_TRUST_HOST`
  is the one flag that changes for a non-Vercel host.

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*
npx prisma migrate deploy
npm run db:seed        # creates the bootstrap System Administrator + active cohort
npm run dev
```

See the root [`README.md`](../README.md) for the full quickstart,
including how to sign in after seeding, and
[`docs/SEEDING.md`](SEEDING.md) for what the seed script does and doesn't
do.

## Test environment

`tests/setup.ts` (Vitest's `setupFiles`) loads the same `.env` via
`dotenv/config`, so integration tests use the same `DATABASE_URL` as
`npm run dev` — a real local Postgres instance, not a separate test
database. See
[`docs/PHASE_2_IMPLEMENTATION_REPORT.md`](PHASE_2_IMPLEMENTATION_REPORT.md#testing)
for why, and how test data is kept isolated from real seed/dev data in
that shared instance.
