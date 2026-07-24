# ADR-0014: `AsyncLocalStorage` for Audit Context, Not Call-Site Threading

**Status**: Accepted (Release 1.5)

## Context

Release 1.5 §"Audit Enhancement" requires every audit record to carry a
Correlation ID, Request ID, User Session ID, IP Address, User Agent, and
timestamp, with "every multi-step action must share the same
Correlation ID." `AuditLog` already had `ipAddress`/`userAgent`/
`correlationId` columns (Phase 2's original design), and
`writeAuditLog` (`lib/audit/log.ts`) already accepted them as optional
parameters — but only one of the ~15 call sites across the codebase
(`lib/auth/authorize.ts`, login attempts) ever actually populated
`ipAddress`/`userAgent`, and nothing anywhere ever populated
`correlationId`. The infrastructure existed; nothing fed it.

## Decision

Populate it via `AsyncLocalStorage` (`lib/audit/context.ts`) — the same
primitive Next.js's own `headers()`/`cookies()` are built on — rather
than threading a context object as an explicit parameter through every
service function that might eventually call `writeAuditLog`.

`ensureAuditContext()` is called once, idempotently, from the two
near-universal request entry points every authenticated page/action/
route handler already passes through:
`requireSession()`/`requirePermissionApi()` (`lib/permissions/
guard.ts`). It reads `headers()` for IP/user agent and the session's
`sessionId` claim, mints a fresh `correlationId`/`requestId`
(`crypto.randomUUID()`, via the existing `newCorrelationId()` helper),
and stores them for the remainder of that request's execution.
`writeAuditLog` reads `getAuditContext()` and falls back to it for any
field the caller didn't explicitly pass.

Result: **zero changes to any of the ~15 existing `writeAuditLog` call
sites.** Every one of them automatically gained correlation/request/
session/IP/user-agent enrichment the moment `guard.ts` started
establishing the context — the "multi-step action shares one
Correlation ID" requirement falls out for free, since every write within
one request/Server Action naturally shares the same context without any
explicit passing.

### `sessionId`, honestly

This codebase's Auth.js session strategy is JWT-only — there is no
server-side `Session` table row to reference (`docs/AUTHENTICATION.md`).
`sessionId` is therefore a `crypto.randomUUID()` minted once, in the
`jwt()` callback, the first time a token is issued for a sign-in
(`token.sessionId`, alongside the existing `token.id`/`token.role`
pattern) and exposed via `session.sessionId`. It identifies "which
sign-in produced this audit row," not a queryable server-side session
record — documented in `types/next-auth.d.ts`'s own comment, not
presented as more than it is.

### `headers()` outside a real request

`next/headers`'s `headers()` throws when called outside an actual App
Router request scope — true for this codebase's integration tests,
which call a Server Action's exported function directly rather than
issuing a real HTTP request. `establishAuditContext` catches that and
falls back to no IP/user agent rather than letting the exception
propagate — matching the audit schema's own "IP Address (where
available)" framing: a real request always has one, a direct function
call in a test genuinely doesn't, and that's not an error condition.

## Alternatives considered

**Add a `context` parameter to `writeAuditLog` and every function that
transitively calls it**, threaded explicitly from each Server Action's
top. Rejected — this would touch every one of the ~15 existing call
sites (and every function on the call path to each of them) purely to
add plumbing, a much larger and riskier diff than the two-guard-function
change actually made, for the same outcome.

**A middleware-level solution** (Next's `middleware.ts`/proxy, setting
headers or cookies the rest of the app reads). Rejected — this
codebase's `proxy.ts` is deliberately Edge-safe and cheap (JWT-only, no
database) per its own documented constraint; `AsyncLocalStorage` isn't
guaranteed available in the Edge runtime the same way, and the guard
functions in `lib/permissions/guard.ts` are already the correct,
existing chokepoint for anything request-scoped that needs a database
read (they already do one, for `requireUser`).

## Consequences

- Any future Server Action or Route Handler that calls `requireSession`/
  `requireActionPermission`/`requirePermissionApi` (i.e., essentially
  all of them) gets audit enrichment automatically — no new call-site
  discipline required going forward.
- A background/system-initiated audit write with genuinely no request
  (none currently exist in this codebase) would simply have no context
  to fall back to — `correlationId`/`requestId`/`sessionId`/`ipAddress`/
  `userAgent` all stay `null`, exactly as they were before this ADR, not
  an error.
- `AsyncLocalStorage.enterWith` (used here, not `.run()`, since there's
  no single wrapping callback available at the guard call site) mutates
  the store for the remainder of the current async execution chain —
  correct for one request's lifetime, and confirmed not to leak across
  Vitest's per-test invocations (each `it()` callback is its own
  top-level chain, not nested inside a shared `AsyncLocalStorage.run()`
  scope).
