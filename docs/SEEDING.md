# Seeding

`prisma/seed.ts`, run via `npm run db:seed` (wired to `prisma migrate deploy`
as well, through `prisma.config.ts`'s `migrations.seed`).

## What it does

1. **Bootstrap System Administrator.** Reads `SEED_ADMIN_NAME`,
   `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` from the environment (see
   [`docs/ENVIRONMENT_CONFIGURATION.md`](ENVIRONMENT_CONFIGURATION.md)) —
   throws immediately if any is missing, rather than silently skipping
   admin creation. Hashes the password with `bcrypt` (cost 12) and
   `upsert`s a `User` row with `role: SYSTEM_ADMIN`.
2. **Bootstrap programme + active cohort.** `upsert`s the `Programme` row
   (slug `"pam-p"`) and, if no `Cohort` with `isActive: true` exists yet,
   creates one for `SEED_COHORT_YEAR` (default `2026`).
3. **Application Review stage** (Phase 3A). Idempotently creates the
   `ReviewStage` row (`code: "APPLICATION_REVIEW"`, `maxTotalScore: 60`)
   — see below for why it stops there.

## Idempotency

Safe to run repeatedly:
- The admin `upsert` uses `email` as the unique key with an empty
  `update: {}` — running the seed again with the same `SEED_ADMIN_EMAIL`
  is a no-op if that account already exists (it does **not** reset the
  password on a re-run, so changing `SEED_ADMIN_PASSWORD` in `.env` after
  the account already exists has no effect without a manual `resetUserPasswordAction`
  or direct database change).
- The active-cohort check looks for *any* `isActive: true` cohort before
  creating one — running the seed again after a cohort already exists
  logs "Active cohort already exists" and creates nothing.

## Why the bootstrap admin never has to change their password

Every account created *through the application* (`createUserAction`,
`resetUserPasswordAction`) sets `mustChangePassword: true` — the person
provisioning the account and the person who'll actually use it are
different people, so the initial password is inherently a shared secret
that should be rotated on first real use.

The seed script is different: `SEED_ADMIN_PASSWORD` is set directly by
whoever controls the deployment's environment variables — there's no
intermediate hand-off, and it's already meant to be treated as a real
credential (stored in a secret manager, not shared over chat/email). The
seed doesn't set `mustChangePassword`, so it defaults to `false`. This is
a deliberate exception, not an oversight: **the operator is expected to
set a genuinely strong, unique `SEED_ADMIN_PASSWORD` before ever running
the seed against a real environment**, and to rotate it manually via the
Users screen or `resetUserPasswordAction` if it's ever suspected to have
been shared insecurely (e.g. pasted into a ticket).

## Security notes

- `SEED_ADMIN_PASSWORD` is only ever read into memory long enough to be
  hashed — it's passed straight to `bcrypt.hash`, never written to a
  variable that outlives that call, never logged, and never stored in
  `AuditLog` (the seed script doesn't write audit entries at all; it
  runs outside any authenticated session and predates the concept of an
  "actor" for this database).
- `.env` (where `SEED_ADMIN_PASSWORD` lives locally) is gitignored. In
  any shared/production environment, set it through your platform's
  secret manager and clear or rotate it after the first successful seed
  if your process doesn't already treat environment variables as
  ephemeral.
- Re-running the seed with a *different* `SEED_ADMIN_EMAIL` creates a
  **second** System Administrator rather than renaming the first — the
  upsert key is the email, so this is additive by design, not a reset
  mechanism. To deactivate a no-longer-needed admin account, use
  `setUserStatusAction` from the Users screen (never delete the row
  directly — see [`docs/AUDIT_LOGGING.md`](AUDIT_LOGGING.md) for why the
  audit trail depends on the account still existing, even inactive).

## The PAM-P Application Review framework

`modules/reviews/seed/seedApplicationReviewStage.ts`, called from
`prisma/seed.ts`'s `main()`. Idempotent the same way as the rest of the
seed (looks up the stage by its unique `(programmeId, cohortId, code)`
before creating it), and takes a `PrismaClient` as a parameter rather
than importing the shared `lib/db/prisma` singleton — it needs to run
from this plain Node script (`tsx`), not just from inside the Next.js
server bundle, so it can't carry the `"server-only"` guard most of
`lib/`/`modules/reviews/` does.

**It seeds the stage — `maxTotalScore: 60`, the one fact the Phase 3A
brief states directly (§4) — and deliberately nothing else.** No
`ReviewFramework`, no `ReviewCriterion`, no `RatingScale`. Per the
brief's own §20 instruction ("do not invent scoring criteria or
weights... where the authoritative documents do not provide enough
information, stop that specific seed operation, identify the missing
information, do not insert invented data"): no "PAM-P Selection Metrics
Framework," "Application Review Guidelines," or "Interview Guidelines"
document exists anywhere in this repository (confirmed by search before
writing any seed code). Inventing plausible-looking criteria that sum to
60 would satisfy the *number* but violate the explicit instruction not
to invent scoring criteria — so the seed stops at the stage, and every
run logs exactly what's still needed before a real framework can be
built:

```
Application Review framework NOT seeded — no approved criteria are available in this repository.
Missing before a framework can be built:
  - The approved list of Application Review criteria (names/codes).
  - Each criterion's maximum score and/or weight within the 60-point total.
  - Each criterion's approved description and reviewer guidance.
  - Whether any criterion uses a rating scale, and if so its bands/labels/anchors.
  - The criteria's approved display order.
```

Once that information exists (from the programme owner — see
[`docs/PHASE_3A_IMPLEMENTATION_REPORT.md`](PHASE_3A_IMPLEMENTATION_REPORT.md)
§20 for the explicit confirmation request), extending the seed to build
the actual framework is straightforward: `createReviewFrameworkDraft` +
`createCriterion` (one call per criterion) + `publishReviewFramework`
from `modules/reviews/services/frameworkService.ts` — the exact
same functions `tests/integration/reviewFramework.test.ts` already
exercises against a test fixture.

## Roles/permissions have no seed step

Unlike a database-backed RBAC model, this codebase's roles and
permissions are code (`lib/rbac/roles.ts`,
`lib/permissions/{catalog,rolePermissions}.ts`), not database rows — see
[`docs/RBAC.md`](RBAC.md#permissions-are-code-not-database-rows) for why.
There is nothing to seed for RBAC: the role-to-permission matrix is
already "seeded," at deploy time, by simply being part of the deployed
code.
