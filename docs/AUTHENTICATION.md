# Authentication

Auth.js (NextAuth) v5, Credentials provider, JWT sessions. No self-service
sign-up — every account is provisioned by a System Administrator (or the
bootstrap seed script; see [`docs/SEEDING.md`](SEEDING.md)).

## Files

| File | Role |
|---|---|
| `lib/auth/auth.config.ts` | Edge/Proxy-safe config: session shape, route-authorization rules. No providers, no database, no bcrypt — this is what `proxy.ts` runs on every request. |
| `lib/auth/auth.ts` | Spreads `auth.config.ts`, adds the Credentials provider and the `signIn`/`signOut` audit events. Exports `auth`, `signIn`, `signOut`, `unstable_update`. |
| `lib/auth/authorize.ts` | The Credentials provider's `authorize` function, extracted to its own module so it can be exercised directly in integration tests without going through NextAuth's HTTP flow (`tests/integration/auth.test.ts`). |
| `lib/permissions/guard.ts` | Page/Server Action guards built on top of `auth()` — see [`docs/RBAC.md`](RBAC.md). |

## Login flow

1. `app/(auth)/login/login-form.tsx` submits to `loginAction` (`app/(auth)/login/actions.ts`), which calls `signIn("credentials", ...)`.
2. `authorizeCredentials` (`lib/auth/authorize.ts`) runs server-side:
   - Validates the payload against `loginSchema` (`lib/validation/auth.ts`).
   - Looks up the user by email. Missing or soft-deleted (`deletedAt` set) → reject.
   - Checks `user.status === "ACTIVE"`. Any other status (`INACTIVE`, `SUSPENDED`, `PENDING_ACTIVATION`, `LOCKED`) → reject.
   - Compares the password against `passwordHash` with `bcrypt.compare`. Mismatch → reject.
   - Returns `{ id, name, email, role, mustChangePassword }` — **never** the password hash.
3. On success, the `events.signIn` handler (`lib/auth/auth.ts`) stamps `lastLoginAt` and writes a `USER_LOGIN` audit entry, in the same transaction.
4. On sign-out, `events.signOut` writes a `USER_LOGOUT` audit entry.

### Why every failure returns the same generic result

`authorizeCredentials` returns `null` for *every* failure path — unknown
email, inactive/suspended/locked account, and wrong password all look
identical to the client (`"Invalid email or password."`). This avoids
account-status enumeration: an attacker probing an email address can't
learn "that account exists but is locked" versus "that account doesn't
exist" from the response.

The *specific* reason is never lost — each failure path writes a distinct
`USER_LOGIN_FAILED` audit entry with `metadata.reason` set to one of
`unknown_user`, `account_not_active` (with the actual `status`), or
`invalid_password`. That detail is visible to anyone with `audit.view`
permission, not to the person attempting to sign in.

This is a deliberate simplification: Auth.js's `CredentialsSignin` error
type doesn't reliably propagate a structured reason through to the client
across versions, so rather than build fragile plumbing to surface three
different client-facing messages, the client message stays uniformly
generic and the audit trail carries the detail. Revisit if a product
requirement genuinely needs a more specific client-facing message (e.g.
"this account is locked, contact your administrator") — that would need
its own explicit design pass on the enumeration trade-off.

## Session strategy

JWT, not database sessions. The token carries `id`, `role`, and
`mustChangePassword` (`lib/auth/auth.config.ts`'s `jwt` callback), copied
into `session.user` by the `session` callback.

**The JWT is a cache, not the source of truth.** `proxy.ts` and the
`authorized` callback use it for a cheap, *optimistic* check on every
request (no database round-trip on prefetched/static routes) — but only
for session existence and the logged-in-user-on-`/login` redirect. The
*authoritative* check for everything else — every Server Component page
and Server Action, including `mustChangePassword` — re-reads the user's
`status`, `role`, and `mustChangePassword` straight from Postgres on
every request via `getAuthorizedUser` (`lib/permissions/service.ts`), so
a deactivation, role change, or password change by an administrator (or
by the user themself) takes effect on the very next request, not
whenever their JWT happens to refresh. See [`docs/RBAC.md`](RBAC.md) for
the full guard hierarchy.

### Why `mustChangePassword` is not enforced at the proxy layer

An earlier version of this flow *did* have the proxy redirect to
`/change-password` straight from the JWT's `mustChangePassword` claim,
mirroring the pattern used for the logged-in-user-on-`/login` redirect.
It was removed after an end-to-end Playwright run — not caught by
typecheck, lint, or the unit/integration test suite — surfaced a real bug
in it: **the JWT claim goes stale in exactly the window that matters
most.** Immediately after `signIn()` sets a new session cookie (at first
login) or `unstable_update()` patches it (after a password change), the
*very next* request's JWT could still reflect the old value — a
same-request/next-request cookie-propagation timing gap, not something
that shows up in a unit test or a hard page reload (both of which read
whatever cookie already fully "settled"). Concretely: a newly created
account was correctly bounced to `/change-password` once, but a
subsequent navigation bounced it right back there even after the
password had already been changed and the database updated — a forced
password-change loop the user couldn't get out of without a fresh
sign-in.

The fix has two parts, both database-verified rather than JWT-trusting:

1. **`requireUser`** (`lib/permissions/guard.ts`), which every dashboard
   page already goes through via `app/(dashboard)/layout.tsx`, is the
   *sole* enforcement point for the forced-password-change redirect. It
   reads `mustChangePassword` fresh from Postgres on every request, so it
   never has this staleness problem.
2. **`app/(auth)/login/actions.ts`'s `loginAction`** chooses the initial
   post-login destination (`/dashboard` vs. `/change-password`) itself,
   from a fresh database read — not from `auth()` (which has the exact
   same same-request staleness problem right after `signIn()` resolves)
   and not from a second, client-side re-navigation through the proxy.

`changePasswordAction` still calls `unstable_update({ user: {
mustChangePassword: false } })` after the database write — not because
anything security-relevant depends on it, but to keep the JWT's claim in
sync for the one place that still reads it for *display* purposes: the
change-password page's forced-vs-voluntary copy
(`app/(auth)/change-password/page.tsx`'s `isForced`).

## Account statuses

`AccountStatus` enum (`prisma/schema.prisma`): `ACTIVE`, `INACTIVE`,
`SUSPENDED`, `PENDING_ACTIVATION`, `LOCKED`. Only `ACTIVE` can sign in or
hold any permission (`getUserPermissions` returns `[]` for every other
status, regardless of role — see [`docs/RBAC.md`](RBAC.md)).

- **INACTIVE / SUSPENDED** — both block sign-in identically today;
  distinguished for the administrator's own record-keeping (e.g.
  "inactive" for someone who's left, "suspended" for a disciplinary
  hold), not by different system behavior. `requirePermission` throws
  `AccountInactiveError` for both.
- **PENDING_ACTIVATION** — reserved for a future invite-based
  provisioning flow (not built in V1.0, where a System Administrator sets
  the initial password directly). Currently behaves exactly like
  `INACTIVE`.
- **LOCKED** — reserved for a future automated lockout policy (e.g. after
  N consecutive failed logins). Not automatically triggered anywhere yet
  — only an administrator can set it, via `setUserStatusAction`.
  `requirePermission` throws the more specific `AccountLockedError` for
  this one status, so a future lockout UI can show "locked" rather than
  a generic "inactive" message if desired.

## Forced and voluntary password change

`User.mustChangePassword` is `true`:
- On every account created via `createUserAction` (the administrator sets
  a temporary password; the new user must change it before doing
  anything else).
- After any administrator-initiated `resetUserPasswordAction`.

It's `false` for the bootstrap seed admin (see
[`docs/SEEDING.md`](SEEDING.md) for why).

Enforcement: `requireUser` (`lib/permissions/guard.ts`) — the
authoritative per-request check every dashboard page goes through —
redirects to `/change-password` whenever `mustChangePassword` is true,
read fresh from Postgres. This is the *only* enforcement point (see
["Why `mustChangePassword` is not enforced at the proxy layer"](#why-mustchangepassword-is-not-enforced-at-the-proxy-layer)
above) — `loginAction` separately chooses `/change-password` as the
initial post-login destination directly from the database, for accounts
that need it from the very first request.

`app/(auth)/change-password/page.tsx` and `actions.ts` serve both the
forced flow and a voluntary "change my password" entry point from the
user menu (`components/layout/user-menu.tsx`). The page uses
`requireSession` (JWT-only), **not** `requireUser` — `requireUser` would
redirect back to `/change-password` if `mustChangePassword` is still
true, looping forever on the very page meant to clear that flag. See the
doc comment on `requireUser` in `lib/permissions/guard.ts`.

The action itself re-verifies the current password with `bcrypt.compare`
before accepting a new one (even in the forced-change case, where the
"current" password is the administrator-set temporary one) and enforces
the same password policy used at account creation. As of Release 1.5
that policy is configurable (Configuration Centre → Security → password
rules), read live via `getPasswordSchema()`
(`lib/validation/auth.ts`) rather than hard-coded — the default (min 10
characters, upper/lower/digit/special character) is unchanged until an
administrator edits it. See `docs/CONFIGURATION_REFERENCE.md`.

## Testing

`tests/integration/auth.test.ts` exercises `authorizeCredentials`
directly against a real local Postgres instance: unknown user, wrong
password, every non-`ACTIVE` status, a valid login, and a soft-deleted
user — asserting both the generic `null`/user-object return value and the
specific `USER_LOGIN_FAILED` audit metadata. `tests/integration/
change-password.test.ts` covers the forced/voluntary change flow. See
[`docs/PHASE_2_IMPLEMENTATION_REPORT.md`](PHASE_2_IMPLEMENTATION_REPORT.md)
for the full test inventory and how to run it.
