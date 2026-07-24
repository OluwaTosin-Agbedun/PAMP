# Phase 3B.1 Implementation Report — Role Vocabulary, Permission, and Navigation Reconciliation

## 1. Executive summary

Phase 3B.1 reconciled the two open architecture items carried since
Phase 0 (`docs/architecture.md`): the codebase's role vocabulary and its
navigation taxonomy both differed from the approved PAM-P operational
model this phase's brief formally stated. Both are now reconciled:

- **Role vocabulary**: `Role.REVIEWER` was split into
  `Role.ELIGIBILITY_REVIEWER` and `Role.APPLICATION_REVIEWER`, matching
  all nine approved PAM-P operational roles exactly. 8 of the 9 approved
  roles already matched the codebase before this phase — this was the
  one substantive change. A safe Postgres enum migration backfilled all
  3 existing `REVIEWER` accounts to `APPLICATION_REVIEWER`, the only
  thing the role had ever actually been used for.
- **Navigation taxonomy**: `lib/navigation.ts` was restructured from 6
  groups (some combining unrelated pipeline stages) into 11 groups —
  one per approved taxonomy item — plus the pre-existing pinned
  Dashboard item, an exact 1:1 match to the approved 12-item list.
  `components/layout/{sidebar-nav,mobile-nav}.tsx` needed no changes.

One governance question is explicitly left open — see §8. Per this
phase's own "stop if any unresolved role mapping requires
programme-owner confirmation" instruction, this report flags it rather
than guessing past it, but nothing about it blocks the reconciliation
work itself: the safe, evidence-supported default was implemented
either way, and only the interpretation of `ELIGIBILITY_REVIEWER`'s
*future* scope remains open.

## 2. Files created and modified

### Created

- **Migration**: `prisma/migrations/20260719160000_phase3b1_role_split/migration.sql`
- **Tests**: `tests/integration/roleReconciliation.test.ts`
- **Docs**: `docs/ROLE_AND_NAVIGATION_RECONCILIATION.md` (the discrepancy
  matrix), this file,
  `docs/adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md`

### Modified

- `prisma/schema.prisma` — `Role` enum: `REVIEWER` → `ELIGIBILITY_REVIEWER`
  + `APPLICATION_REVIEWER`.
- `lib/rbac/roles.ts` — `ROLES`, `ROLE_LABELS` updated for the split.
- `lib/permissions/catalog.ts` — added `NOTIFICATIONS_VIEW` (the
  Notifications taxonomy slot).
- `lib/permissions/rolePermissions.ts` — split the `REVIEWER` entry into
  `ELIGIBILITY_REVIEWER` (read-only eligibility oversight) and
  `APPLICATION_REVIEWER` (the former `REVIEWER` capability set,
  unchanged); added `NOTIFICATIONS_VIEW` to every non-`FELLOW` role.
- `lib/navigation.ts` — restructured `NAV_GROUPS` to the approved
  12-item taxonomy (see §4).
- `modules/reviews/services/assignmentService.ts` — the reviewer
  candidate pool query now selects `Role.APPLICATION_REVIEWER` (the role
  that actually performs application-review work).
- `tests/helpers/db.ts` — `createTestUser`'s default role is now
  `Role.APPLICATION_REVIEWER` (same default behavior as before, renamed).
- `tests/unit/rolePermissions.test.ts`,
  `tests/integration/{auth,permissions,reviewAssignmentEngine,
  reviewDataIntegrity,reviewFramework,reviewLifecycle,reviewPermissions,
  users-actions}.test.ts`, `tests/unit/validation.test.ts` — every
  `Role.REVIEWER`/`"REVIEWER"` reference updated to
  `Role.APPLICATION_REVIEWER`/`"APPLICATION_REVIEWER"` (81 occurrences);
  `tests/unit/rolePermissions.test.ts` additionally gained a dedicated
  `ELIGIBILITY_REVIEWER` coverage test.
- `docs/{RBAC,architecture,database}.md` — updated for the new role
  vocabulary; `docs/RBAC.md`'s "why one REVIEWER role" section marked
  superseded (kept, not deleted — its reasoning is why
  `ELIGIBILITY_REVIEWER` is scoped read-only).

Nothing under `app/`, `components/`, or `proxy.ts` changed — every route
guard, Server Action, and UI component already derived role/permission
behavior generically from `lib/rbac/roles.ts` and
`lib/permissions/{catalog,rolePermissions}.ts` (confirmed by inspection
before making any change, not assumed); updating those two modules was
sufficient to propagate correctly everywhere, including the Users admin
screen's role dropdown (`ASSIGNABLE_ROLES`/`ROLE_LABELS`-driven) and
`lib/validation/user.ts`'s `createUserSchema` (derives valid roles from
`ASSIGNABLE_ROLES` dynamically).

## 3. Schema change

One migration:
`prisma/migrations/20260719160000_phase3b1_role_split/`. Postgres enums
have no `ALTER TYPE ... DROP VALUE` — a value can only be removed by
creating a replacement type, migrating every column that uses it,
dropping the old type, and renaming the new one into place. `Role` is
used by exactly one column (`users.role`), so this was a single
`ALTER COLUMN ... TYPE ... USING`, with a `CASE` expression backfilling
every existing `'REVIEWER'` row to `'APPLICATION_REVIEWER'` in the same
statement. Verified before writing the migration (3 real `REVIEWER`
rows, all backfill-eligible) and after applying it (all 9 enum values
present in the correct order, all 3 rows correctly migrated, `id`/
`status`/audit history untouched) via direct `psql` queries — the same
verification discipline applied to every schema-affecting migration this
session. See §5 below and
[ADR-0009](adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md) for
the full reasoning.

## 4. Navigation taxonomy

| Approved item | Nav group `id` | Notes |
|---|---|---|
| 1. Dashboard | *(pinned, not a group)* | Unchanged. |
| 2. Applicant Import | `applicant-import` | New: added the `/applicants/import` nav entry (route already existed, had no sidebar link before); renamed group from "Applicant Management". |
| 3. Eligibility Screening | `eligibility-screening` | Promoted out of "Administration". See §8/known gap below. |
| 4. Application Review | `application-review` | Split out of the former combined "Reviews & Interviews" group; relabeled from "Reviewer Workspace". |
| 5. Interview Management | `interview-management` | Split out of the same former group; relabeled from "Interview Workspace". |
| 6. Selection Committee | `selection-committee` | Split out of the former combined "Selection" group. |
| 7. Executive Approval | `executive-approval` | Split out of the same former group. |
| 8. Admissions | `admissions` | Unchanged. |
| 9. Reports | `reports` | Relabeled from "Reports & Analytics". |
| 10. Notifications | `notifications` | New: no prior nav entry, permission, or route existed at all. Added as an `implemented: false` placeholder with a new `notifications.view` permission. |
| 11. Audit Trail | `audit-trail` | Promoted out of "Administration". |
| 12. Administration | `administration` | Now contains only Users — Eligibility Criteria and Audit Trail moved to their own taxonomy slots. |

Full discrepancy matrix (role and nav) in
[`docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`](ROLE_AND_NAVIGATION_RECONCILIATION.md).

## 5. Role migration safety

- **No user deleted.** Every account that existed before this migration
  still exists, with the same `id`.
- **Only `role` changed**, and only for the 3 accounts that had
  `role = 'REVIEWER'`. `status`, `email`, `passwordHash`, `createdAt`,
  every `ReviewAssignment`/`Review`/`AuditLog` row referencing those
  accounts — all untouched.
- **No previously-applied migration was rewritten** — this is a new
  migration file, applied on top of the existing 7.
- **The mapping is evidence-supported, not a guess.** All 3 accounts had
  real `ReviewAssignment`/`Review` history exclusively tied to automatic
  application-review assignment (via the pre-existing
  `autoAssignReviewers`, which only ever queried `Role.REVIEWER`); none
  has any eligibility-review history, because eligibility screening has
  always been fully automatic — there is no eligibility-review action
  any account could have performed. `APPLICATION_REVIEWER` is the
  correct mapping for all 3, established by their actual usage.
- **Auditability preserved.** Nothing about the migration erases or
  rewrites `AuditLog` history — every prior `REVIEW_ASSIGNED`,
  `REVIEW_SUBMITTED`, etc. entry for these accounts remains exactly as
  it was.

## 6. Testing

`tests/integration/roleReconciliation.test.ts` (8 new tests) covers
every item in this phase's brief's test list not already covered
elsewhere:

- The approved role vocabulary is exactly the 9 named roles (no
  `OBSERVER`, no bare `REVIEWER`); `PROGRAMME_SECRETARY`'s label matches
  `"Programme Secretary/Admin"`.
- `ELIGIBILITY_REVIEWER` cannot perform an application review — tested
  as a real service call (`reviewService.createReview` rejecting with
  `AuthorisationError`), not just permission-list membership.
- `APPLICATION_REVIEWER` has no eligibility-decision authority
  (`eligibility.manage_criteria`, `eligibility.review` both denied).
- `INTERVIEWER` cannot access Selection Committee or Executive Approval
  actions or views.
- `EXECUTIVE` has read-only visibility plus the approve action, nothing
  else.
- Navigation matches permissions — `navGroupsForRole` returns the
  expected group set per role, including the "implemented: false items
  never render regardless of permission" case (`SYSTEM_ADMIN`, who has
  every permission, still only sees 3 groups, since 8 of 11 approved
  taxonomy items have no route yet).
- Direct URL access remains server-protected — `requirePermission` (the
  exact check `requirePagePermission`/`requireActionPermission` also
  perform) still denies regardless of what the sidebar shows.
- A user migrated from `REVIEWER` to `APPLICATION_REVIEWER` retains
  valid access, and status enforcement (suspension) still overrides role
  correctly afterward.

`tests/unit/rolePermissions.test.ts` gained a dedicated
`ELIGIBILITY_REVIEWER` test and an updated `APPLICATION_REVIEWER` test
asserting the split's negative space (no eligibility authority on one
side, no scoring authority on the other).

**Full suite after this phase's changes: 242 tests passing across 21
files** (`npx vitest run`), up from 233/20 before this phase — the 81
mechanical `Role.REVIEWER` → `Role.APPLICATION_REVIEWER` renames caused
zero regressions (verified by running the full suite, not assumed from
the rename being "obviously safe").

## 7. Known gap, deliberately not filled

The "Eligibility Screening" nav group's one item is the existing
criteria-*configuration* screen (`eligibility.manage_criteria`,
`PROGRAMME_DIRECTOR`/`SYSTEM_ADMIN` only) — there is no dedicated
"view eligibility decisions" route for `ELIGIBILITY_REVIEWER` to land
on; eligibility decisions are currently only visible inline on the
Applicant Detail page. An `ELIGIBILITY_REVIEWER` account therefore sees
no item under "Eligibility Screening" today. Building a dedicated
eligibility-decisions view is new UI scope, not a role/permission/
navigation reconciliation, and is not invented here — flagged as a
concrete follow-up instead. See
[`docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`](ROLE_AND_NAVIGATION_RECONCILIATION.md#a-known-gap-this-reconciliation-does-not-paper-over).

## 8. Open governance question — not resolved by this phase

**Does the approved PAM-P workflow intend `Eligibility Reviewer` to
eventually perform a human review/override action on automatic
eligibility decisions, or is it a permanently read-only oversight role?**
Eligibility screening remains fully automatic in this codebase
(unchanged since Phase 2's deliberate design); `ELIGIBILITY_REVIEWER` as
implemented this phase is read-only — the minimal, evidence-supported
interpretation that changes nothing about the existing eligibility
engine. If the intent is for eligibility to gain a human review/override
step, that is new eligibility-engine feature scope for a future phase
(new service logic, a new permission, a new audit trail, new UI) — not
something this reconciliation phase should guess at and partially build.
See [ADR-0009](adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md)'s
"Open question" section for the full reasoning.

**Per this phase's own instruction ("stop after Phase 3B.1 if any
unresolved role mapping requires programme-owner confirmation"), this is
that item.** Everything else in the acceptance criteria is satisfied and
verified (§9); this one interpretation question is the one thing left
for the programme owner to confirm before Phase 3C — though its answer
doesn't require redoing any of this phase's work, only deciding whether
a *future* phase adds new eligibility-review capability.

## 9. Verification

- `npx prisma validate` — clean.
- `npx prisma migrate status` — up to date, no drift, 8 migrations
  applied.
- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 242/242 passing, 21 files.
- `npx next build` — compiles, typechecks, and generates all routes
  successfully.

## 10. Acceptance criteria

- [x] One authoritative role vocabulary exists — 9 roles, matching the
      approved PAM-P list exactly.
- [x] One permission catalogue exists — no duplicate/overlapping
      permission concepts introduced.
- [x] One navigation taxonomy exists — 12 items, one nav group each.
- [x] Role and nav naming matches approved PAM-P terminology.
- [x] Unsupported roles removed or formally justified — `Observer` was
      already absent (Phase 0 decision, reconfirmed here); `REVIEWER`
      replaced by the two approved roles.
- [x] Existing users safely migrated — see §5.
- [x] Server-side permission enforcement remains intact — no guard
      function changed; verified by the full test suite plus the
      dedicated direct-URL-access test.
- [x] All tests pass — 242/242.
- [x] Documentation complete — this report,
      `docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`, ADR-0009,
      `docs/RBAC.md`, `docs/architecture.md`, `docs/database.md` all
      updated.

One item remains for explicit programme-owner confirmation before
Phase 3C, per §8 above — not because Phase 3C is blocked by unfinished
reconciliation work, but because the answer shapes whether a *later*
phase needs to add new eligibility-engine capability.
