# Phase 2 Implementation Report — Application Foundation, Authentication and Role-Based Access Control

## 1. Executive summary

Phase 2 rebuilt the authorization foundation this project is built on:
account statuses beyond active/inactive, a code-based permission
catalogue with a DB-verified authorization service, a typed error model,
structured operational logging (separate from the audit trail), a forced/
voluntary password-change flow, an expanded Users admin screen, and a
Vitest test suite (unit + real-Postgres integration) exercising all of
the above. No new application/workflow modules were built — per the
brief, Reviewer/Interview/Committee/Executive/Admissions remain
untouched, and no new import functionality was added.

The single largest architectural decision this phase made — and the one
most worth a reviewer's attention — is keeping RBAC **code-based**
(`lib/permissions/`) rather than moving to the normalized
`Roles`/`Permissions`/`UserRole`/`RolePermission` tables the brief's
prose assumes already exist. See §5 and
[`docs/RBAC.md`](RBAC.md#permissions-are-code-not-database-rows) for the
full rationale; the short version is that this project's approved
database design doesn't have those tables, nothing in V1.0 requires
dynamic/admin-editable roles, and building them now would be exactly the
"unnecessary database redesign" the brief itself warned against.

## 2. Files created / modified

### Created

- **Permissions & guards**: `lib/permissions/catalog.ts`,
  `lib/permissions/rolePermissions.ts`, `lib/permissions/service.ts`,
  `lib/permissions/guard.ts`
- **Errors**: `lib/errors/AppError.ts`, `lib/errors/handleAction.ts`,
  `lib/errors/index.ts`
- **Logging**: `lib/logging/logger.ts`
- **Auth**: `lib/auth/authorize.ts` (extracted `authorize` function,
  independently testable)
- **Change-password flow**: `app/(auth)/change-password/{page.tsx,actions.ts,change-password-form.tsx}`
- **Access-denied page**: `app/access-denied/page.tsx`
- **Users admin additions**: `app/(dashboard)/users/status-labels.ts`
- **Migration**: `prisma/migrations/20260719090000_phase2_auth_rbac_foundation/migration.sql`
- **Tests**: `vitest.config.ts`, `tests/setup.ts`,
  `tests/mocks/server-only.ts`, `tests/helpers/db.ts`,
  `tests/unit/{validation,rolePermissions,errors}.test.ts`,
  `tests/integration/{auth,permissions,users-actions,change-password}.test.ts`
- **Docs**: this file, plus `docs/{AUTHENTICATION,RBAC,AUDIT_LOGGING,ENVIRONMENT_CONFIGURATION,SEEDING}.md`

### Modified

- `prisma/schema.prisma` — `AccountStatus` enum, `User.status`
  (replacing `User.isActive`), `User.mustChangePassword`,
  `AuditLog.{programmeId,cohortId,correlationId}` + indexes.
- `lib/auth/auth.ts`, `lib/auth/auth.config.ts`, `types/next-auth.d.ts`
  — status checks, `mustChangePassword` claim, failed-login audit,
  `unstable_update` export and its `jwt` callback handling.
- `lib/audit/actions.ts`, `lib/audit/log.ts` — new audit action
  vocabulary, new `writeAuditLog` fields.
- `lib/navigation.ts` — `NavItem.module` → `NavItem.permission?`.
- `lib/validation/auth.ts`, `lib/validation/user.ts` — added
  `changePasswordSchema`, `accountStatusSchema`, `resetPasswordSchema`.
- `modules/reviews/assignment.ts` — `isActive: true` → `status: "ACTIVE"`.
- `proxy.ts` — doc comment updated to point at the new guard module.
- Every page/action under `app/(dashboard)/{applicants,eligibility-criteria,users}`
  and `app/(dashboard)/{layout,dashboard/page}.tsx` — migrated from
  `lib/rbac/{guard,permissions,actions}.ts` to `lib/permissions/{guard,catalog,rolePermissions}.ts`.
- `app/(dashboard)/users/{actions.ts,page.tsx,create-user-dialog.tsx,user-row-actions.tsx}`
  — full `AccountStatus` support (not just active/inactive), password
  reset action.
- `components/layout/user-menu.tsx` — added the voluntary "Change
  password" entry.
- `package.json` — added `vitest`, `test`/`test:watch` scripts.

### Deleted

- `lib/rbac/guard.ts`, `lib/rbac/permissions.ts`, `lib/rbac/actions.ts`
  — fully superseded by `lib/permissions/*`, and confirmed via `grep`
  that no call site still referenced them before deletion. `lib/rbac/roles.ts`
  (the `Role` enum re-export and `ROLE_LABELS`) is kept — it's the role
  vocabulary, not the old guard/permission logic.

## 3. Schema changes / migrations

One migration this phase:
`prisma/migrations/20260719090000_phase2_auth_rbac_foundation/`.

| Change | Why |
|---|---|
| `AccountStatus` enum (`ACTIVE`, `INACTIVE`, `SUSPENDED`, `PENDING_ACTIVATION`, `LOCKED`) | The brief requires these five statuses; the prior schema only had `User.isActive: Boolean`. |
| `User.status AccountStatus @default(ACTIVE)`, replacing `User.isActive Boolean` | Direct consequence of the above — one column, not a parallel boolean kept in sync. |
| `User.mustChangePassword Boolean @default(false)` | Required for the forced-password-change flow (§6, §21 of the brief). |
| `AuditLog.{programmeId,cohortId,correlationId}` + 3 new indexes | Required fields for the audit model (§16 of the brief) that weren't in the Phase 0/Sequence 1 schema. |

**This was reviewed against the "do not redesign the database
unnecessarily" instruction before being written** — the existing
approved schema (`docs/database.md`) already covered every entity Phase 2
actually needs (`User`, `AuditLog`) except these four fields, so the
change is additive and minimal, not a redesign. No table was added,
renamed, or restructured.

### Safe migration for existing data

`ALTER TABLE "users" ADD COLUMN "isActive" → "status"` is not a
mechanical rename: a naive `ADD COLUMN status AccountStatus NOT NULL
DEFAULT 'ACTIVE'` would have silently reactivated every already-inactive
account (Postgres backfills existing rows with the column default). One
real account in this project's dev database
(`chinaza.igwe@pam-p.org`) was `isActive: false` at migration time.
The migration was hand-written instead of using Prisma's interactive
`migrate dev` (which refused to run non-interactively against a
destructive change) — generated via `prisma migrate diff
--from-config-datasource --to-schema-datamodel prisma/schema.prisma
--script` for the raw SQL, then hand-edited to:

```sql
ALTER TABLE "users" ADD COLUMN "status" "AccountStatus";
UPDATE "users" SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"AccountStatus" ELSE 'INACTIVE'::"AccountStatus" END;
ALTER TABLE "users" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "users" DROP COLUMN "isActive";
```

i.e. add nullable → backfill from the old value → enforce `NOT NULL` →
drop the old column. Applied via `prisma migrate deploy` and verified
against the live database afterward: `chinaza.igwe@pam-p.org` came out
as `INACTIVE`, not the default `ACTIVE`, and the four hand-written
`pg_trgm` GIN indexes from the database-design phase (invisible to
Prisma's schema-diff engine, since they're not declarable in
`schema.prisma`) were confirmed still present — Prisma's raw diff had
proposed dropping them, and those statements were excluded by hand
before applying.

## 4. Auth architecture

See [`docs/AUTHENTICATION.md`](AUTHENTICATION.md) for the full writeup.
Summary of what changed this phase:

- `authorize` extracted from an inline closure in `lib/auth/auth.ts` into
  `lib/auth/authorize.ts`'s `authorizeCredentials`, independently
  testable.
- Every login failure path (unknown user, inactive/suspended/locked/
  pending status, wrong password) now writes a distinct
  `USER_LOGIN_FAILED` audit entry with a specific `metadata.reason`,
  while the client-facing message stays uniformly generic
  ("Invalid email or password") across all of them — an explicit,
  documented anti-enumeration decision.
- `mustChangePassword` added to the JWT/session shape, enforced solely by
  the authoritative, database-verified `requireUser` guard
  (`lib/permissions/guard.ts`) plus `loginAction`'s own fresh database
  read for the initial post-login destination — **not** by a JWT-level
  proxy check. An earlier version did add one (mirroring the existing
  logged-in-on-`/login` pattern), but an end-to-end Playwright run found
  it caused a forced-password-change redirect loop, from a same-request
  JWT-cookie staleness window right after `signIn()`/`unstable_update()`.
  See §8 and [`docs/AUTHENTICATION.md`](AUTHENTICATION.md#why-mustchangepassword-is-not-enforced-at-the-proxy-layer)
  for the full account.
- `unstable_update` exported and still used by `changePasswordAction`,
  now only to keep the JWT's `mustChangePassword` claim in sync for the
  change-password page's display copy — no security check depends on it.

## 5. RBAC / permission architecture

See [`docs/RBAC.md`](RBAC.md) for the full writeup, including the
code-vs-database-tables decision (§1 above) and every `[ext]` addition to
the brief's example permission catalogue and why.

Layer summary:

```
lib/permissions/catalog.ts          — permission identifiers (strings)
lib/permissions/rolePermissions.ts  — Role → Permission[] matrix
lib/permissions/service.ts          — DB-verified: getAuthorizedUser, hasPermission, requirePermission, ...
lib/permissions/guard.ts            — page/action-level guards built on the service (redirect-based)
```

Every function in `service.ts` re-reads `role`/`status`/
`mustChangePassword` from Postgres on every call — never trusts the
JWT — so a role change or deactivation by an administrator takes effect
on the affected user's very next request. `tests/integration/
permissions.test.ts` has an explicit regression test for this.

## 6. Initial role → permission matrix

See the full table in
[`docs/RBAC.md`](RBAC.md#role--permission-matrix). Unchanged in shape
from the Sequence 1 module-access matrix's intent, restated at
finer-grained (per-capability, not per-page) resolution:

| Role | Summary |
|---|---|
| `SYSTEM_ADMIN` | Everything. |
| `PROGRAMME_DIRECTOR` | Broad view/oversight, no user administration. |
| `PROGRAMME_SECRETARY` | Import/export/edit + eligibility view + admissions manage + read-only visibility into reviews/interviews/committee/executive. |
| `REVIEWER` | Applications view, eligibility view, reviews perform/view. |
| `INTERVIEWER` | Applications view, interviews view/score. |
| `SELECTION_COMMITTEE_MEMBER` | Applications view, committee view/review. |
| `EXECUTIVE` | Applications view, executive view/approve. |
| `FELLOW` | None. |

## 7. Audit logging implementation

See [`docs/AUDIT_LOGGING.md`](AUDIT_LOGGING.md). New this phase:
`programmeId`/`cohortId`/`correlationId` columns and indexes; five new
`AUDIT_ACTIONS` entries (`USER_LOGIN_FAILED`, `USER_UPDATED`,
`USER_STATUS_CHANGED`, `USER_PASSWORD_RESET`, `USER_PASSWORD_CHANGED`);
every user-administration action (create, status change, role change,
password reset, self password change, login, login failure, logout) now
writes an entry with the actor, entity, and a `metadata` object holding
before/after values where relevant — never a secret.

## 8. Test results

```
$ npx vitest run
 Test Files  7 passed (7)
      Tests  62 passed (62)
```

### Real bugs found and fixed via end-to-end browser testing

Following this project's established practice (Sequence 1's three
end-to-end-only bugs, documented in `docs/architecture.md`), the full
forced-password-change flow was walked through with a real Chromium
instance (Playwright) against the dev server and a real database — not
committed as a permanent spec file (this phase's testing deliverable is
the Vitest suite above), but run as part of verification. It found two
real bugs neither `tsc`, `eslint`, `next build`, nor the Vitest suite
could have caught, because none of them exercise the proxy or a live
client-side navigation:

1. **`Response.redirect()` in the proxy's `authorized` callback broke a
   client-side RSC transition.** Immediately after the login Server
   Action's own redirect to `/dashboard` (which the browser follows as a
   soft, client-side navigation, not a full page load), the proxy's
   `mustChangePassword` redirect — built with the raw Web `Response.redirect()`
   — caused the client router to throw "An unexpected response was
   received from the server" and abort the redirect, landing the user on
   `/dashboard` instead of `/change-password`. Fixed by switching to
   `NextResponse.redirect()` (from `next/server`) for both proxy-level
   redirects in `auth.config.ts`.
2. **The proxy's `mustChangePassword` check itself was fundamentally
   unreliable, independent of bug 1.** The JWT claim it reads goes stale
   in exactly the window right after `signIn()` or `unstable_update()`
   sets a new session cookie — the *next* request's JWT can still reflect
   the old value. This produced a forced-password-change loop: a newly
   created account correctly landed on `/change-password` once, but
   after actually changing the password, the very next dashboard
   navigation bounced the user right back to `/change-password` — because
   the proxy's stale JWT still said `mustChangePassword: true`, even
   though the database (and the authoritative `requireUser` check) both
   correctly said `false`. Fixed by removing JWT-level enforcement of
   this claim entirely: `requireUser` (already database-verified, already
   running on every dashboard request via the layout) is now the sole
   enforcement point, and `loginAction` chooses the initial post-login
   destination from a fresh database read rather than from `auth()` or a
   second client-side hop through the proxy. Full account in
   [`docs/AUTHENTICATION.md`](AUTHENTICATION.md#why-mustchangepassword-is-not-enforced-at-the-proxy-layer).

The full flow — login rejection by status, forced password change
(including a rejected wrong-current-password attempt), permission-gated
navigation (a Reviewer denied `/users` both in the sidebar and by direct
URL), voluntary password change from the user menu, and an
administrator's status change taking effect on the deactivated user's
very next request with no re-login — was re-verified end to end after
both fixes, along with the resulting audit trail (`USER_CREATED`,
`USER_LOGIN`, two `USER_PASSWORD_CHANGED` entries, `USER_STATUS_CHANGED`
with correct `from`/`to` metadata) queried directly from Postgres.

| Suite | File | What it covers |
|---|---|---|
| Unit | `tests/unit/validation.test.ts` | `passwordSchema`, `changePasswordSchema`, `loginSchema`, `createUserSchema`, `accountStatusSchema`, `resetPasswordSchema` — no I/O. |
| Unit | `tests/unit/rolePermissions.test.ts` | `permissionsForRole` per role; least-privilege assertions (no non-admin role has a user-administration permission). |
| Unit | `tests/unit/errors.test.ts` | `handleActionError` passes through `AppError` messages, never leaks a raw/unexpected error's message, still logs it server-side. |
| Integration (real Postgres) | `tests/integration/auth.test.ts` | `authorizeCredentials`: unknown user, wrong password, every non-`ACTIVE` status, valid login, soft-deleted user — asserting both the return value (password hash never present) and the specific `USER_LOGIN_FAILED` audit metadata. |
| Integration (real Postgres) | `tests/integration/permissions.test.ts` | `getAuthorizedUser`/`getUserRoles`/`getUserPermissions`/`hasPermission`/`hasAnyPermission`/`hasAllPermissions`/`requirePermission`; a role change and a status change each "take effect on the very next check." |
| Integration (real Postgres, mocked Next runtime) | `tests/integration/users-actions.test.ts` | `createUserAction`, `setUserStatusAction`, `changeUserRoleAction`, `resetUserPasswordAction`: authorized/unauthorized creation, duplicate-email rejection, status/role changes with audit trail, a client-provided role can't bypass the server-derived actor role, password reset never stores the plaintext value. |
| Integration (real Postgres, mocked Next runtime) | `tests/integration/change-password.test.ts` | Forced/voluntary password change: success clears `mustChangePassword` and refreshes the JWT, wrong current password rejected without mutating anything, weak/identical new password rejected, inactive account blocked even with the correct current password. |

### How integration tests are isolated from real data

All integration tests share the same local Postgres instance used for
`npm run dev` (per the brief's explicit instruction to test "against the
real local Postgres," not a mock). Every test-created row uses an email
on the `@test.pam-p.invalid` domain (`tests/helpers/db.ts`); cleanup
(`afterEach`/`afterAll`) deletes only rows on that domain (plus any
orphaned `USER_LOGIN_FAILED` audit rows whose `metadata.email` matches
it, for the "unknown user" case where no `User` row ever exists to key
off). Verified by direct query after a full test run: zero leftover
`@test.pam-p.invalid` rows, and the four pre-existing seed/dev users
(`admin@pam-p.org`, `chinaza.igwe@pam-p.org` — still `INACTIVE`,
`reviewer.one@pam-p.org`, `reviewer.two@pam-p.org`) unchanged.

### Testing a Next.js Server Action outside Next.js

`tests/integration/users-actions.test.ts` and `change-password.test.ts`
import the real `"use server"` action functions directly and mock only
the three Next.js runtime primitives they touch that require an actual
request context: `next/navigation`'s `redirect` (thrown as a detectable
sentinel error), `next/cache`'s `revalidatePath` (no-op), and `@/lib/auth/auth`'s
`auth`/`unstable_update` (mocked to return a session for the acting test
user's real `id`, so every downstream permission check still hits the
real database with real data). Everything else — Prisma, bcrypt, the
permission service, the audit writer, Zod validation — runs unmocked, so
these tests exercise the actual production code path, not a
reimplementation of its logic.

Two enabling changes were made specifically for testability:
1. `authorize` was extracted to `lib/auth/authorize.ts` (§4) so it's
   importable without going through NextAuth's HTTP handler.
2. `createUserAction`'s `requireActionPermission` call was moved outside
   its `try/catch` (previously it was inside, which would have
   *silently swallowed a permission-denial redirect into a generic
   error message* — a real bug caught while writing the
   "redirects (denies) an unauthorized caller" test, fixed before this
   report was written, not left as a known issue).

### `server-only` in a test environment

Several `lib/*` modules (`lib/permissions/{guard,service}.ts`,
`lib/errors/handleAction.ts`, `lib/logging/logger.ts`,
`lib/audit/log.ts`, `lib/cohort.ts`) start with `import "server-only"` —
a package that intentionally throws when imported outside a bundler's
`"react-server"` resolve condition, which Vitest doesn't set.
`vitest.config.ts` aliases `"server-only"` to `tests/mocks/server-only.ts`
(an empty module) so these files are importable in tests without
weakening the guard in the actual Next.js build — the alias only exists
in the test config, never shipped.

## 9. Typecheck / lint / build results

```
$ npx tsc --noEmit
(no output — clean)

$ npx eslint .
(no output — clean)

$ npm run build
✓ Compiled successfully
✓ Generating static pages (12/12)

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /access-denied
├ ƒ /api/auth/[...nextauth]
├ ƒ /applicants
├ ƒ /applicants/[id]
├ ƒ /applicants/import
├ ƒ /change-password
├ ƒ /dashboard
├ ƒ /eligibility-criteria
├ ○ /login
└ ƒ /users
```

## 10. Security considerations

- **Password hashing**: `bcryptjs`, cost 12, everywhere a password is
  set (seed, `createUserAction`, `resetUserPasswordAction`,
  `changePasswordAction`). Never the native `bcrypt` binding, avoiding
  serverless build issues (a Phase 0 decision, unchanged).
- **No account-status enumeration at login** — see §4 and
  [`docs/AUTHENTICATION.md`](AUTHENTICATION.md#why-every-failure-returns-the-same-generic-result).
- **DB-verified authorization, not JWT-trusting** — a deactivation or
  role change takes effect immediately, not at next token refresh. This
  is the central authorization upgrade this phase made; see §5.
- **Every mutation re-derives the actor's permissions server-side** from
  their session's user id — never from a client-supplied role/permission
  value. Directly tested (`tests/integration/users-actions.test.ts`).
- **Last-active-System-Administrator protection**: `setUserStatusAction`
  and `changeUserRoleAction` both refuse to leave zero active
  `SYSTEM_ADMIN` accounts. See §11 for why this specific branch isn't
  covered by the automated integration suite.
- **Self-lockout protection**: a user cannot change their own account
  status (`setUserStatusAction` throws `ValidationError` if
  `userId === actor.id`).
- **Secrets never logged or audited**: see
  [`docs/AUDIT_LOGGING.md`](AUDIT_LOGGING.md#never-logging-secrets) for
  the two independent layers (call-site discipline + `logger.ts`'s
  `redact()` backstop). Verified by test assertion, not just review, in
  every action that handles a password.
- **`.env` / secrets handling**: see
  [`docs/ENVIRONMENT_CONFIGURATION.md`](ENVIRONMENT_CONFIGURATION.md#secrets-handling).

## 11. Known limitations

- **"Last active admin" protection isn't exercised by the automated
  integration suite's true zero-remaining-admins branch.** The count
  query is global across the real `users` table, which in this shared
  dev database always includes the real seeded `admin@pam-p.org`
  account — driving that count to zero in a test would mean
  deactivating real seed data, which the test suite deliberately never
  does. Covered by manual QA instead; a dedicated ephemeral test
  database per CI run would remove this limitation, but wasn't judged
  worth the added infrastructure for V1.0.
- **`LOCKED` status has no automated trigger.** The schema and
  `AccountLockedError` distinguish it from `INACTIVE`/`SUSPENDED`, but
  nothing currently sets it automatically (e.g. after N failed logins) —
  only an administrator can, via the Users screen. Intentional: no
  requirement in this phase called for an automated lockout policy, and
  building one without a specified threshold/window would be guessing at
  a requirement.
- **`PENDING_ACTIVATION` has no invite flow.** Currently behaves exactly
  like `INACTIVE`; reserved for a future invite-based provisioning flow
  that doesn't exist in V1.0 (accounts are created with a password set
  directly by an administrator, not via an email invite).
- **Correlation IDs aren't threaded through every audit-writing action**,
  only the login path. See
  [`docs/AUDIT_LOGGING.md`](AUDIT_LOGGING.md#correlation-ids).
- **RBAC remains code-based, not database rows** — by design (§1, §5),
  but worth restating as a limitation for a future phase that might
  need runtime-editable roles/permissions without a deploy: that would
  require the junction-table redesign this phase deliberately deferred.
- **SSO adapter caveat** (pre-existing, unchanged this phase, restated
  from `docs/architecture.md`): `@auth/prisma-adapter` doesn't cleanly
  resolve Prisma 7's custom-output client type; needs a look when SSO
  work actually starts.
- **No permanent Playwright/browser E2E suite was added this phase.** A
  full Playwright run against a real Chromium instance and the dev server
  *was* part of verification (§8) — it's what caught the two proxy/JWT
  bugs neither the type checker, linter, build, nor Vitest suite could
  have found — but it was run ad hoc, not committed as a maintained spec
  file. `playwright` is already a dependency from an earlier phase; worth
  formalizing into a committed suite in a later phase once there's more
  UI surface to justify the maintenance cost, covering at minimum the
  flow this phase's ad hoc run exercised (login rejection by status,
  forced password change, permission enforcement, audit trail).

## 12. Recommended next phase

Per the brief's explicit instruction, **no Reviewer/Interview/Committee/
Executive/Admissions work was started**, and none is recommended to
start automatically. Phase 2's own scope is now complete: authentication,
account lifecycle, RBAC, audit logging, error handling, structured
logging, and documentation are in place and tested against a real
database. The natural next phase — pending explicit sign-off — is
Sequence 2: the core review loop (`ReviewCriterion`/`Review`/
`ReviewScore`, the Reviewer Workspace, Status Tracking, Notes, and
third-reviewer divergence), which is exactly where
`docs/architecture.md`'s existing "Next: Sequence 2" section already
points, and needs nothing further from this phase to begin.
