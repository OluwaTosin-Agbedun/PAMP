# Handoff — PAM-P Fellowship Management System

Start here if you're picking this project up cold. This folder is a
snapshot written 2026-07-19 to hand off from one Claude session to the
next (or to a human developer) without losing context that only existed
in chat history.

## What this is

A role-based application review and admissions platform for the Pius
Anyim Mentorship Programme (PAM-P) — Next.js 16, TypeScript, PostgreSQL,
Prisma 7, Auth.js v5, Tailwind v4, shadcn/ui. Repo: `juneudogu-prog/desktop-tutorial`.
Branch: **`claude/pam-p-fms-build-3vx9ux`** — all work described here is
committed and pushed to it, working tree clean as of this snapshot.

## Read in this order

1. **`AGENTS.md`** (repo root, also linked from `CLAUDE.md`) — this
   project pins a customized Next.js whose APIs diverge from your
   training data. It says, verbatim: *"Read the relevant guide in
   `node_modules/next/dist/docs/` before writing any code."* Don't skip
   this — it's caught real bugs earlier in this build.
2. **`docs/architecture.md`** — the master narrative of every phase
   built, in order, with links to the detailed doc for each. This is the
   single most useful file in the repo for orientation. Its last two
   sections cover exactly where this handoff picks up.
3. **This folder**, in order:
   - `DECISIONS_LOG.md` — every genuine governance question hit so far
     and how it was resolved. Read this before re-asking any of these.
   - `ENTERPRISE_FUNCTIONAL_SPECIFICATION_ADDENDUM.md` — the verbatim
     spec currently driving all new work. It supersedes earlier
     assumptions about Interview Scheduling/Scoring/Ranking/Admissions;
     treat it as authoritative over anything older that conflicts.
   - `PROJECT_INSTRUCTION_HISTORY.md` — every substantive instruction
     given for this project since the very first message, verbatim, in
     order, each with a one-line note on what was built in response and
     where to read about it. The Addendum above is entry 19 of this;
     everything before it is the full brief history `docs/architecture.md`
     and every `PHASE_*_IMPLEMENTATION_REPORT.md` were written from. Go
     here when you need a requirement's *exact original wording*, not a
     paraphrase.
   - `REMAINING_WORK.md` — the module-by-module backlog, in dependency
     order, with the specific gotchas found while planning each one
     (existing-but-unused schema to reuse, settings that already exist
     but point the wrong way, etc.).
4. **`docs/adr/`** — one file per architectural decision, numbered.
   ADR-0015 through ADR-0017 are the most recent and most relevant to
   what's in flight.

## Current state

- **Branch:** `claude/pam-p-fms-build-3vx9ux`, pushed, clean working tree.
- **Latest code commit:** `36fef5a` — "Interview Scheduling (Enterprise
  Functional Spec Addendum Module 1)". Commits after this one are
  documentation-only (this `handoff/` folder) unless `git log` shows
  otherwise by the time you're reading this — check `git log --oneline -5`
  rather than trusting this snapshot for anything past this point.
- **Full verification, last run clean:**
  - `npx vitest run` — 342/342 passing (one pre-existing flaky test,
    see `REMAINING_WORK.md`'s "Known pre-existing issue").
  - `npx playwright test tests/e2e/accessibility.spec.ts` — 18/18
    passing, zero axe-core violations across every screen this build has
    added, desktop and mobile viewports.
  - `npx tsc --noEmit`, `npx eslint .` — clean.
  - `npm run build` — clean.
  - `npx prisma validate`, `npx prisma migrate status` — schema valid,
    12 migrations applied, database up to date.
- **Task tracker:** this session used the harness's own TaskCreate/
  TaskList tools (tasks #1–100). That tracker is session-scoped and will
  not carry over — `REMAINING_WORK.md` is the portable version of tasks
  #93–100, the only ones still pending.

## What's built (see `docs/architecture.md` for full detail)

Phase 0 → Phase 2 → Phase 3A → Phase 3B → Phase 3B.1 → Phase 3C →
Phase 3D → Release 1.5 → Release 1 Module 1 (Interview Assignment
Engine) → Release 1 Module 2 (Interview Workspace) → **Interview
Scheduling** (Addendum Module 1, current tip). Auth/RBAC/audit
foundation, applicant import, eligibility engine, review framework +
scoring engine, review assignment engine + blind review, Reviewer
Workspace UI, Programme Secretariat Review Operations Workspace,
Enterprise Configuration Centre, Eligibility QA governance, Interview
Assignment Engine (panel assignment, conflicts, capacity), Interview
Workspace (panellist scoring UI), Interview Scheduling (availability,
slot generation, applicant token-booking, Secretariat confirmation,
Teams link, invitations/reminders — all recorded, not dispatched, see
below).

## What's next

`REMAINING_WORK.md`, in order: Interview Scoring revision (the shipped
Module 2 needs updating against the Addendum's stricter rules — this is
genuinely revision work, not new scope) → Interview Questions →
Final Ranking → Tie-Breaking → Final Selection Committee → Reserve
List → Offer Management → a final audit-completeness sweep.

## Before you touch code: conventions that took real effort to establish

- **No schema shortcuts.** Every "unused since Phase 1" model
  (`InterviewQuestion`, `CommitteeVote`, `CommitteeDecision`,
  `AdmissionOffer`, `ExecutiveApproval`, `ApplicationScore`'s
  `interviewAverage`/`compositeScore`/`rank`/`rankingTier`) was designed
  up front and is sitting there waiting for its consuming module — check
  for one before adding a new table. `REMAINING_WORK.md` names the ones
  relevant to each upcoming module.
- **Reuse pure domain functions across "sides."** The interview-side
  scoring math (`modules/interviews/domain/interviewScoring.ts`) is
  mostly a thin wrapper around `modules/reviews/domain/scoring.ts`'s
  functions, not a parallel implementation — same for eligibility/
  workload-balancing reuse in `modules/interviews/services/panelAssignmentService.ts`.
  Look for the review-side equivalent before writing new math.
  Interview-side error handling follows the same instinct: reuse
  Review-named `AppError` subclasses with a custom, contextual message
  rather than inventing parallel `Interview*Error` classes.
- **Everything mutating writes an audit log entry**, using
  `AUDIT_ACTIONS` from `lib/audit/actions.ts` (add new ones there, never
  a raw string) and `writeAuditLog` from `lib/audit/log.ts` (it picks up
  request context — IP, correlation ID, session — automatically via
  `lib/audit/context.ts`, so you don't need to pass those explicitly).
- **Decimal serialization boundary.** `Prisma.Decimal` values never
  cross the Server → Client Component boundary directly — always
  `.toString()` them into a view-model type first (see any
  `app/(dashboard)/**/types.ts` file, and ADR-0010 for the full
  reasoning).
- **"Own data only" is enforced structurally, not by a visibility flag.**
  Every service function that should only ever return one actor's own
  data takes that actor's own ID as the scoping parameter — it never
  accepts someone else's ID as an argument at all. That's how blind
  review, blind interview scoring, and the token-scoped public booking
  page all guarantee no accidental data leak, rather than relying on a
  filter that could be forgotten at a new call site.
- **Test cleanup ordering.** Postgres FK constraints with the default
  `RESTRICT` action mean `tests/helpers/{db,reviewFixtures}.ts`'s cleanup
  functions have to delete child rows in a specific order before parent
  rows (Application before Cohort, RankingSnapshot before Application,
  etc.). Every new model this session added needed a cleanup-order fix
  the first time its tests ran — if you add a new model with a foreign
  key to `User`, `Cohort`, or `Application`, expect to add a line to
  those two files, in the right position, or a later test's `finally`
  block will throw a foreign-key-violation error that has nothing to do
  with the test itself. If you hit a mystery FK error in `afterEach`/
  `finally`, this is almost certainly why — check the delete order, not
  your new code's logic.
- **No email or job-scheduler infrastructure exists anywhere in this
  codebase**, on purpose (see `DECISIONS_LOG.md` §4). Don't invent one
  inside a feature module — record and audit, never dispatch, exactly
  like `modules/interviews/services/schedulingService.ts`'s
  `sendInvitations`/`sendDueReminders`.
- **A schema/migration change follows a specific non-interactive
  workflow** because `npx prisma migrate dev --create-only` fails
  non-interactively on anything Prisma flags as potentially destructive
  (even against an empty table): use
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  to generate the raw SQL, hand-edit it into a migration folder (strip
  the four recurring false-positive `DROP INDEX applicants_*_trgm_idx`
  statements — a known diff-tool quirk against this DB's manually-created
  pg_trgm indexes, present in every migration since Sequence 1), then
  `npx prisma migrate deploy`.

## Local environment

```bash
npm install
cp .env.example .env   # DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Postgres must be running before any Prisma or `npx vitest run` command
(`pg_isready`; in a fresh container: `sudo -u postgres pg_ctlcluster 16
main start`). Playwright's Chromium is pre-installed in this environment
— don't run `playwright install`.
