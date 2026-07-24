# Role-Based Access Control

## Roles

`lib/rbac/roles.ts` (`Role` enum, generated from `prisma/schema.prisma`):

| Role | Purpose |
|---|---|
| `SYSTEM_ADMIN` | Full system access, including user administration. |
| `PROGRAMME_DIRECTOR` | Broad read/oversight access across the review pipeline; no user administration. |
| `PROGRAMME_SECRETARY` | Operational administration — import, eligibility, admissions — without user administration or approval authority. Labeled "Programme Secretary/Admin" (`ROLE_LABELS`) — the approved PAM-P name for this role. |
| `ELIGIBILITY_REVIEWER` | Read-only oversight of automatic eligibility decisions. No scoring capability. |
| `APPLICATION_REVIEWER` | Performs application reviews (scores, submits). |
| `INTERVIEWER` | Scores interviews. |
| `SELECTION_COMMITTEE_MEMBER` | Votes at the Selection Committee stage. |
| `EXECUTIVE` | Final approval authority. |
| `FELLOW` | No module access in V1.0 — reserved for the Fellow Portal in a future version. |

`ASSIGNABLE_ROLES` (`lib/rbac/roles.ts`) excludes `FELLOW` — a System
Administrator provisioning a staff account can't accidentally create a
Fellow-role account through the Users screen; that role is reserved for
when the Fellow Portal actually ships.

### The REVIEWER split (Phase 3B.1) — superseding the Phase 2 decision below

**This section originally explained why the codebase used one `REVIEWER`
role instead of separate Eligibility/Application Reviewer roles.** Phase
3B.1's brief formally named `Eligibility Reviewer` and `Application
Reviewer` among the nine approved PAM-P operational roles, which
supersedes that decision — the single `REVIEWER` value was split into
`ELIGIBILITY_REVIEWER` and `APPLICATION_REVIEWER` via a Postgres enum
migration, with every existing `REVIEWER` account safely backfilled to
`APPLICATION_REVIEWER` (the only thing the role had ever actually been
used for). See
[`docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`](ROLE_AND_NAVIGATION_RECONCILIATION.md)
and
[`docs/adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md`](adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md)
for the full reasoning.

**The original reasoning below is still correct and still shapes what
`ELIGIBILITY_REVIEWER` actually grants** — it's kept, not deleted,
because it explains *why* the new role is deliberately read-only rather
than a guess:

Eligibility screening is still fully automatic
(`modules/eligibility/service.ts`, driven by admin-configured criteria,
no human decision in the loop) — there's still no human "eligibility
review" *action* to gate with a role. `ELIGIBILITY_REVIEW` remains a
*read-only* permission for exactly this reason, and it's now
`ELIGIBILITY_REVIEWER`'s only capability (plus `applications.view` for
context) rather than being folded into a combined `REVIEWER` role or
`PROGRAMME_SECRETARY`'s broader view access. `ELIGIBILITY_MANAGE_CRITERIA`
remains the separate, narrower permission for configuring the rules
themselves, held only by `SYSTEM_ADMIN` and `PROGRAMME_DIRECTOR` — an
`ELIGIBILITY_REVIEWER` cannot edit criteria, only see automatic
decisions. Whether the approved PAM-P workflow eventually wants
`ELIGIBILITY_REVIEWER` to *perform* a human review/override action (new
eligibility-engine capability, not yet built) is an open question this
phase does not resolve — see
`docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`'s "open governance
question."

## Permissions are code, not database rows

Phase 2 was specified assuming pre-existing normalized `Roles` /
`Permissions` / `UserRole` / `RolePermission` tables. This codebase's
approved database design (see [`docs/database.md`](database.md)) doesn't
have those tables — `User.role` is a single enum column, and the
role-to-permission mapping lives in code
(`lib/permissions/rolePermissions.ts`). This was a deliberate decision
made during this phase's "first action" review, not an oversight:

- **No requirement anywhere calls for dynamic, admin-editable roles or
  permissions in V1.0.** The 9-role catalogue and its permission grants
  are fixed by the approved design. A junction-table model earns its
  complexity when roles/permissions need to be edited without a deploy —
  nothing in this phase's brief asks for that.
- **A schema change here would be exactly the "don't redesign the
  database unnecessarily" case this phase's brief explicitly warns
  against.** Adding four new tables and a migration to represent a
  mapping that's currently eight `Role → Permission[]` array literals is
  disproportionate to the actual requirement.
- **The two designs are behaviorally equivalent from the call site's
  point of view.** Every authorization decision goes through
  `lib/permissions/service.ts`'s functions
  (`hasPermission`/`getUserPermissions`/etc.) — nothing outside that
  module knows or cares whether the mapping is a database join or an
  in-memory lookup. Moving to real tables later, if a future phase
  genuinely needs admin-editable RBAC, is a change *inside*
  `lib/permissions/rolePermissions.ts` and a migration — it doesn't touch
  any of the ~15 call sites across the app.

`ROLES_VIEW`, `ROLES_MANAGE`, and `PERMISSIONS_VIEW` are defined in the
catalogue (for the base-catalogue completeness the brief asked for) but
enforced nowhere yet — there's no roles-management UI in V1.0, since
roles aren't editable.

## The permission catalogue

`lib/permissions/catalog.ts` — every fine-grained capability in the
system as a stable string identifier (`"applications.view"`,
`"users.manage_status"`, etc.), grouped by domain and documented inline
with `[base]` (taken verbatim from the phase brief's example catalogue)
or `[ext]` (an addition this codebase actually needs) markers. Notable
`[ext]` additions and why:

| Permission | Why it's not in the brief's example list |
|---|---|
| `applications.import` / `.export` | Excel/CSV import (Sequence 1) needs a permission; the brief's example catalogue predates that module. |
| `users.manage_status` | Generalizes the brief's `users.deactivate` to the full `AccountStatus` range (activate/deactivate/suspend/lock) — the brief's example predates the multi-state status model this phase adds. `users.deactivate` is kept as an alias-in-spirit, granted to the same roles, for forward compatibility with anything that names it directly. |
| `users.manage_roles`, `users.reset_password` | Split out from `users.update` — role assignment and password resets are more sensitive than a name/email edit and deserve independent grants. |
| `*.view` companions (`reviews.view`, `committee.view`, `executive.view`, `admissions.view`) | The "global read, never act" pattern: several roles (notably `PROGRAMME_SECRETARY`) need visibility into a later pipeline stage without the authority to act at that stage. Each `*.view` permission is the read-only counterpart to its `*.perform`/`.vote`/`.approve`/`.manage` sibling. |
| `review_frameworks.{view,create,update,publish,retire}`, `review_scores.{view,submit,reopen}` | Phase 3A (§15) — `[base]`, taken directly from the phase brief's suggested list. `review_scores.submit` is deliberately separate from the pre-existing `reviews.perform` (Sequence 1): a Reviewer already has `reviews.perform` for working on an assigned review, and gains `review_scores.submit` for the scoring engine's specific "finalize this review" action — the two together, not one replacing the other. |
| `assignments.{view,reassign,cancel}`, `conflicts.{declare,manage}`, `reviewer_capacity.{view,manage}` | Phase 3B (§10/§11 of the assignment engine brief). `assignments.reassign` is deliberately separate from the pre-existing `reviews.assign` (Sequence 1, kept for triggering an initial assignment) — reassigning an already-assigned reviewer is administratively more sensitive (mandatory reason, preserves history) and gets its own grant. `conflicts.declare` (a reviewer declaring their own conflict) is separate from `conflicts.manage` (an administrator recording one on a reviewer's behalf) — the same "self-service vs. administrative" split already used elsewhere in this catalogue. |
| `notifications.view` | Phase 3B.1 — the "Notifications" navigation taxonomy slot (`docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`). Delivery isn't built yet; this exists now, the same way `roles.view`/`permissions.view` were defined before any roles-management UI existed, so the nav slot is already permission-gated the day delivery ships. |
| `review_operations.{view,export}`, `review_escalations.view`, `administrative_notes.create` | Phase 3D — the Programme Secretariat Review Operations Workspace. Everything else that workspace needs (assignment/conflict/capacity/score visibility) reuses the Phase 3B/3A permissions above rather than duplicating them — see `docs/PROGRAMME_SECRETARIAT_WORKSPACE.md`'s reconciliation table. |
| `configuration.{view,manage}` | Release 1.5 — the Configuration Centre. `configuration.manage` occupies the slot the Phase 2 brief's `system.configure` was reserved for but never wired to anything (renamed, not duplicated — confirmed unused everywhere before the rename). |
| `eligibility_recommendations.create`, `eligibility_override.execute` | Release 1.5 — the Eligibility QA governance model. Deliberately two permissions, never held by the same role: the reviewer who flags a case can never execute its override. See `docs/ELIGIBILITY_QA_GOVERNANCE.md`. |
| `feature_flags.manage` | Release 1.5 — toggling a feature flag, System-Administrator-only; kept separate from `configuration.manage` since it's a platform-level switch, not a programme-operational value. |

## Role → permission matrix

`lib/permissions/rolePermissions.ts`, `ROLE_PERMISSIONS: Record<Role,
Permission[]>`. Least-privilege: every role has exactly the permissions
its job requires.

| Role | Permission set |
|---|---|
| `SYSTEM_ADMIN` | Everything in the catalogue — including, uniquely, `review_frameworks.retire`, `review_scores.reopen` (§16: only System Administrator retires a framework or reopens a submitted review), and (Release 1.5) `feature_flags.manage`. |
| `PROGRAMME_DIRECTOR` | `PROGRAMME_OVERSIGHT`: broad view/manage across programmes, cohorts, applications, eligibility, reviews, interviews, committee, executive, admissions, reports, and audit — no user administration. Now also `review_frameworks.{view,create,update,publish}`, `review_scores.view`, (Phase 3B) `assignments.{view,reassign}`, `conflicts.manage`, `reviewer_capacity.{view,manage}`, (Phase 3D) `review_operations.{view,export}`, `review_escalations.view`, `administrative_notes.create`, and (Release 1.5) `configuration.{view,manage}` — but notably **not** `eligibility_override.execute` (§16: "create or edit frameworks where approved, publish where authorised" — granted at the role level, the same way this codebase already handles every other "where approved"/"where authorised" phrase, since there's no per-instance approval-gate mechanism). |
| `PROGRAMME_SECRETARY` | Applications view/import/export/edit, eligibility view, admissions manage, plus `*.view` visibility into reviews/interviews/committee/executive (never the act-on-it permission for those stages) — now including `review_frameworks.view`, `review_scores.view`, (Phase 3B) `assignments.{view,reassign,cancel}`, `conflicts.manage`, `reviewer_capacity.{view,manage}` — the primary human operator of the assignment engine (§10), (Phase 3D) `review_operations.{view,export}`, `review_escalations.view`, `administrative_notes.create`, and (Release 1.5) `configuration.{view,manage}` plus, uniquely, `eligibility_override.execute` ("Only Programme Secretariat may execute an approved override" — see `docs/ELIGIBILITY_QA_GOVERNANCE.md`) — but notably **not** `reviews.assign` (triggering an initial/manual assignment stays a Programme Director/System Administrator action, unchanged from Sequence 1; the Secretary's Phase 3B grants are all about monitoring and correcting *existing* assignments, not creating new ones from scratch). |
| `ELIGIBILITY_REVIEWER` | *(Phase 3B.1, split from the former single `REVIEWER` role — see above.)* Applications view, `eligibility.review` (read-only), and (Release 1.5) `eligibility_recommendations.create` — flag a questionable outcome and recommend an override, but never execute one. No scoring capability, no criteria-management capability, no override-execution capability. |
| `APPLICATION_REVIEWER` | *(Phase 3B.1, the other half of the split.)* Identical capability set to the former `REVIEWER` role — applications view, reviews perform/view, `review_frameworks.view` (to see the framework they're scoring against), `review_scores.submit` (to finalize a review), and (Phase 3B) `conflicts.declare` (to self-declare a conflict of interest) — deliberately **not** `assignments.view` (a reviewer's own assignment visibility is covered by repository-level scoping, `reviewerId = session.user.id`, not a broad view permission — see `docs/BLIND_REVIEW.md`) and deliberately **not** `eligibility.review` (no eligibility-decision authority — that's `ELIGIBILITY_REVIEWER`'s). |
| `INTERVIEWER` | Applications view, interviews view/score. |
| `SELECTION_COMMITTEE_MEMBER` | Applications view, committee view/review. |
| `EXECUTIVE` | Applications view, executive view/approve. |
| `FELLOW` | None. |

Every non-`FELLOW`, non-`SYSTEM_ADMIN` role additionally gets
`notifications.view` (Phase 3B.1) — inert until the Notifications module
itself ships (see the permission catalogue table above).

## The authorization service

`lib/permissions/service.ts` — the one place every authorization decision
is made. All functions read the user fresh from Postgres on every call
(via `getAuthorizedUser`, `React.cache()`-wrapped for per-request
deduplication only — see "DB-verified, not JWT-trusted" below).

| Function | Behavior |
|---|---|
| `getAuthorizedUser(userId)` | `null` if the user doesn't exist or is soft-deleted; otherwise `{ id, name, email, role, status, mustChangePassword }`. |
| `getUserRoles(userId)` | `[user.role]`, or `[]` if the user can't be found. (Single-role model — this project has no multi-role-per-user requirement.) |
| `getUserPermissions(userId)` | `permissionsForRole(role)`, or `[]` for any non-`ACTIVE` status. **Status always wins over role** — a suspended `SYSTEM_ADMIN` has zero permissions. |
| `hasPermission(userId, permission)` | Boolean. |
| `hasAnyPermission(userId, permissions[])` | Boolean, OR semantics. |
| `hasAllPermissions(userId, permissions[])` | Boolean, AND semantics. |
| `requirePermission(userId, permission)` | Returns the `AuthorizedUser` on success; throws a typed `AppError` on failure — `AuthenticationError` (no such user), `AccountLockedError`/`AccountInactiveError` (status), or `AuthorisationError` (missing permission). For services/Server Actions that want to fail loudly and let `handleActionError` translate the result, rather than branch on a boolean. |

### DB-verified, not JWT-trusted

The JWT session (see [`docs/AUTHENTICATION.md`](AUTHENTICATION.md))
carries `role`/`status`/`mustChangePassword` as cached claims, but every
function above re-queries Postgres — it never reads those claims. This
means a role change or account deactivation/suspension by a System
Administrator takes effect on the affected user's *very next request*,
not whenever their token happens to refresh. (`mustChangePassword`
specifically is *not* also checked at the JWT/proxy level the way
session-existence is — see
[`docs/AUTHENTICATION.md`](AUTHENTICATION.md#why-mustchangepassword-is-not-enforced-at-the-proxy-layer)
for why a same-request cookie-staleness bug made that unreliable.) This is the deliberate upgrade this phase made over trusting the
session: `tests/integration/permissions.test.ts` has an explicit test
("a role change takes effect on the very next check") proving this.

`React.cache()` on `getAuthorizedUser` is purely a per-request
optimization (so five permission checks inside one page render cost one
query, not five) — it does **not** cache across requests. Next.js resets
the cache boundary at each request; outside of that (e.g. in a plain Node
script or a Vitest test with no request boundary), the plain `react`
package's `cache()` is a no-op passthrough, so tests see fresh data on
every call too.

## Guards

`lib/permissions/guard.ts` — the layer pages and Server Actions actually
call. Built on top of `lib/permissions/service.ts` plus Next.js's
`redirect()`, since a redirect (not a thrown error) is the right UX for a
denied full-page navigation.

| Function | Use | Behavior on denial |
|---|---|---|
| `requireSession()` | Session existence only — cheap, JWT-based. Used by `/dashboard` (parent layout already did the authoritative check) and by `/change-password` (see below). | Redirect to `/login`. |
| `requireUser()` | **The authoritative "who is allowed to be here" check.** Used by `app/(dashboard)/layout.tsx`, so it runs on every dashboard request without every page needing to remember to call it. Also enforces the forced password-change redirect. | Redirect to `/login`, `/access-denied?reason=account_inactive`, or `/change-password`. |
| `requirePagePermission(permission)` | Server Components that need a specific permission, on top of `requireUser`'s checks. | Redirect to `/access-denied?reason=forbidden`. |
| `requireAnyPagePermission(permissions[])` | Same, OR semantics — a page reachable by more than one role. | Same. |
| `requireActionPermission(permission)` | Server Actions — defense-in-depth on top of a page that's already permission-gated. | Same redirect UX as the page-level guards (a Server Action denial is still a full request in this app; there's no separate "toast an error" flow for authorization failures specifically — see the note on `createUserAction` below). |
| `requirePermissionApi(permission)` | Route Handlers, which need a `Response` rather than a redirect. | Returns `{ user: null, response: new Response(null, { status }) }` (401/403). |

**Do not call `requireUser` (or `requireActionPermission`, which shares
its status-check logic) from the `/change-password` page or action
itself** — the forced-password-change redirect target would redirect to
itself, looping. That page uses `requireSession` and does its own
`status`/`mustChangePassword` handling inline. See the doc comment on
`requireUser` in `lib/permissions/guard.ts`.

### A note on `createUserAction` and redirect-vs-error

`app/(dashboard)/users/actions.ts`'s `createUserAction` calls
`requireActionPermission` **before** its own `try/catch` block, not
inside it. `requireActionPermission` denies by throwing Next's internal
redirect signal — if that call were inside the `try`, the generic
`catch` clause (added to translate database errors like a duplicate
email into a safe `{ error }` return) would catch and swallow the
redirect, turning a permission denial into a confusing generic error
message instead of an actual redirect. `tests/integration/
users-actions.test.ts` has a regression test for this
("redirects (denies) an unauthorized caller") using a mocked `redirect`
that throws a detectable sentinel, specifically to catch this class of
bug.

## Permission enforcement checklist

Every route/action added to this codebase should:
1. Call the appropriate `require*` guard from `lib/permissions/guard.ts`
   as the first thing it does (or rely on `app/(dashboard)/layout.tsx`'s
   `requireUser` for routes that only need "any active staff member").
2. Never branch on a client-supplied role or permission value — the
   guard always re-derives the *actor's* permissions server-side from
   their session's `userId`, ignoring anything the request body claims.
   `tests/integration/users-actions.test.ts`'s "the server re-derives the
   actor's role, ignoring anything the client sends" test exercises this
   directly: an `APPLICATION_REVIEWER` calling `changeUserRoleAction`
   with a `SYSTEM_ADMIN` target role is still denied.
3. Add new permission identifiers to `lib/permissions/catalog.ts` only —
   never check a role name directly outside `rolePermissions.ts`.
