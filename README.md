# PAM-P Fellowship Management System (FMS)

Role-based application review and admissions platform for the Pius Anyim
Mentorship Programme (PAM-P), built on Next.js, PostgreSQL, and Prisma.

**Picking this project up after a break, or as a new Claude session?**
Start at [`handoff/README.md`](handoff/README.md) — current build state,
what's done, what's next, and every governance decision already made.

This repository currently has: authentication, a database-verified RBAC
and permission system, full account-lifecycle management (multi-state
account status, forced/voluntary password change, audit logging), the
application shell, applicant Excel/CSV import, an automatic eligibility
engine, automatic reviewer assignment, and a UI-independent review
framework/scoring engine (configurable, versioned rubrics; deterministic
decimal-safe scoring; draft/submit/reopen lifecycle) — plus the complete
Version 1.0 database foundation (scoring, interviews, committee,
executive approval, admissions, ranking — reviewer-facing UI ships in a
later phase). See [`docs/architecture.md`](docs/architecture.md) for the
application architecture and roadmap,
[`docs/database.md`](docs/database.md) for the full database design (ERD,
indexing/audit/soft-delete strategy, migration plan),
[`docs/PHASE_2_IMPLEMENTATION_REPORT.md`](docs/PHASE_2_IMPLEMENTATION_REPORT.md)
for the authentication/RBAC/audit foundation built in Phase 2, and
[`docs/PHASE_3A_IMPLEMENTATION_REPORT.md`](docs/PHASE_3A_IMPLEMENTATION_REPORT.md)
for the review framework/scoring engine built in Phase 3A. Deeper docs:
[`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md),
[`docs/RBAC.md`](docs/RBAC.md), [`docs/AUDIT_LOGGING.md`](docs/AUDIT_LOGGING.md),
[`docs/ENVIRONMENT_CONFIGURATION.md`](docs/ENVIRONMENT_CONFIGURATION.md),
[`docs/SEEDING.md`](docs/SEEDING.md),
[`docs/REVIEW_FRAMEWORK.md`](docs/REVIEW_FRAMEWORK.md),
[`docs/SCORING_ENGINE.md`](docs/SCORING_ENGINE.md),
[`docs/REVIEW_LIFECYCLE.md`](docs/REVIEW_LIFECYCLE.md),
[`docs/SCORE_CALCULATION_RULES.md`](docs/SCORE_CALCULATION_RULES.md).

## Quickstart

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*
npx prisma migrate dev
npm run db:seed        # creates the bootstrap System Administrator
npm run dev
```

Sign in at `http://localhost:3000/login` with the `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` you set in `.env`. The seed also creates the active
cohort applicants import against — create a `REVIEWER` account or two
before importing so automatic reviewer assignment has someone to assign
to. Any account created through the Users screen (or via
`resetUserPasswordAction`) must change its password at first sign-in —
see [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Run the Vitest suite once (unit + integration, against a real local Postgres — see [`docs/PHASE_2_IMPLEMENTATION_REPORT.md`](docs/PHASE_2_IMPLEMENTATION_REPORT.md#testing)) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run prisma:migrate` | Create/apply a migration locally |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run db:seed` | Provision the bootstrap System Administrator |

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS v4 · shadcn/ui ·
PostgreSQL · Prisma 7 · Auth.js (NextAuth) v5.
