# Audit Logging

The append-only business record of "what happened" — never updated, never
deleted. Distinct from the [structured operational log](#vs-structured-logging)
below.

## Schema

`AuditLog` (`prisma/schema.prisma`):

| Field | Notes |
|---|---|
| `id` | `cuid()`. |
| `actorId` | Nullable `User.id` reference, `onDelete: SetNull` — a deleted user's past actions stay in the trail; only the link to their (now-gone) account is cleared. `null` for system-initiated events with no human actor (none exist yet in V1.0). |
| `action` | A string from `AUDIT_ACTIONS` (`lib/audit/actions.ts`) — the canonical vocabulary every module writes from, so the eventual Audit Trail viewer has one consistent set of action names from the start rather than free-form strings invented per call site. |
| `entityType` / `entityId` | What the action was about (`"User"`, `"EligibilityCriterion"`, etc. + its id). Indexed together for "all events for this record" queries. |
| `metadata` | `Json?` — previous/new value, reason, or any other display-only detail (e.g. `{ from: "REVIEWER", to: "PROGRAMME_DIRECTOR" }`). **Never** passwords, hashes, tokens, or secrets — see [Never logging secrets](#never-logging-secrets) below. |
| `ipAddress`, `userAgent` | Captured where available (currently: login attempts, via the Credentials provider's `authorize(credentials, request)` second argument). |
| `programmeId`, `cohortId` | Denormalized, **not** foreign keys — audit rows must survive the referenced programme/cohort being deleted. Added this phase so "all events for this cohort" is a direct filter, not a `metadata` extraction. |
| `correlationId` | Ties every audit row produced by one request/action together, and is threaded into the structured log line for the same request — see [Correlation IDs](#correlation-ids). |
| `createdAt` | Set once, at insert. |

## Writing an audit entry

`writeAuditLog` (`lib/audit/log.ts`) is the only way application code
writes to this table:

```ts
await writeAuditLog({
  actorId: user.id,
  action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
  entityType: "User",
  entityId: target.id,
  metadata: { from: previousStatus, to: newStatus },
});
```

`ipAddress`/`userAgent`/`programmeId`/`cohortId`/`correlationId` are all
optional — most call sites (anything not on the request/response path,
like a Server Action that already ran through `requireActionPermission`)
omit them; the login path is the one place today that captures IP/user
agent, since that's where `Request` is actually available (Server
Actions don't receive one).

### Actions defined this phase

Added to `AUDIT_ACTIONS` alongside the pre-existing set:
`USER_LOGIN_FAILED`, `USER_UPDATED`, `USER_STATUS_CHANGED`,
`USER_PASSWORD_RESET`, `USER_PASSWORD_CHANGED` — replacing the old
boolean `USER_ACTIVATED`/`USER_DEACTIVATED` pair's exclusive use now that
`AccountStatus` has five values, not two. (`USER_ACTIVATED`/
`USER_DEACTIVATED` are kept in the vocabulary for historical rows written
before this phase; new status changes write `USER_STATUS_CHANGED` with
`metadata.from`/`.to`.)

## What writes an audit entry

| Event | Action | Written by |
|---|---|---|
| Successful login | `USER_LOGIN` | `events.signIn` (`lib/auth/auth.ts`) |
| Failed login (any reason) | `USER_LOGIN_FAILED` | `authorizeCredentials` (`lib/auth/authorize.ts`) — see below |
| Sign-out | `USER_LOGOUT` | `events.signOut` (`lib/auth/auth.ts`) |
| Account created | `USER_CREATED` | `createUserAction` |
| Status changed (activate/deactivate/suspend/lock/etc.) | `USER_STATUS_CHANGED` | `setUserStatusAction` |
| Role changed | `USER_ROLE_CHANGED` | `changeUserRoleAction` |
| Password reset by an administrator | `USER_PASSWORD_RESET` | `resetUserPasswordAction` |
| Password changed by the user themself | `USER_PASSWORD_CHANGED` | `changePasswordAction` |
| Eligibility criterion created/updated, decision recorded | `ELIGIBILITY_CRITERION_*`, `ELIGIBILITY_DECISION_RECORDED` | `app/(dashboard)/eligibility-criteria/actions.ts`, `modules/eligibility/service.ts` |

(Applicant import, review, interview, committee, executive, and
admissions actions are listed in `AUDIT_ACTIONS` for forward
compatibility with later phases; only the rows above are wired up as of
Phase 2.)

### Login failures always audit — even when the client sees a generic message

`authorizeCredentials` writes a `USER_LOGIN_FAILED` entry on **every**
failure path, with `metadata.reason` set to exactly which check failed
(`unknown_user`, `account_not_active` — with the actual `status` — or
`invalid_password`), even though the client-facing error is always the
same generic "Invalid email or password." This is intentional: the audit
trail (admin-only, via `AUDIT_VIEW`) is where that detail belongs; the
sign-in UI is deliberately not the place to disclose it. See
[`docs/AUTHENTICATION.md`](AUTHENTICATION.md#why-every-failure-returns-the-same-generic-result).

### Failed operations never write a misleading success record

Every audit-writing action in this codebase runs the `writeAuditLog` call
*after* the mutation it describes has already succeeded (e.g.
`resetUserPasswordAction` writes `USER_PASSWORD_RESET` only after
`prisma.user.update` resolves). If validation fails or the database
operation throws first, execution never reaches the audit write — there
is no code path that logs "password reset" for a reset that didn't
happen. `tests/integration/users-actions.test.ts`'s "rejects a weak
password without changing the existing hash" test and its siblings
assert both halves of this: the mutation didn't happen *and* no
misleading audit row exists.

## Never logging secrets

Two independent layers, not one:

1. **Discipline at the call site.** No call to `writeAuditLog` in this
   codebase ever passes a password, password hash, or token in
   `metadata`. `resetUserPasswordAction` and `changePasswordAction`, the
   two places a new password value exists in memory, pass no `metadata`
   at all to their audit calls.
2. **Defense-in-depth in the structured logger**, not the audit table
   itself: `lib/logging/logger.ts`'s `redact()` strips any object key
   matching `/password|passwordHash|token|secret|authorization|cookie/i`
   before a structured log line is written. This is a safety net for the
   *operational* log (see below), which is more likely to have arbitrary
   context objects passed to it by future code than the tightly-scoped
   `writeAuditLog` call sites are.

`tests/integration/users-actions.test.ts` and `change-password.test.ts`
both assert, per relevant test, that the plaintext password value never
appears anywhere in the resulting `AuditLog` row (`JSON.stringify(audit)`
must not contain it).

## Correlation IDs

`newCorrelationId()` (`lib/logging/logger.ts`, `crypto.randomUUID()`)
generates one ID per login attempt today, threaded into both the
`USER_LOGIN_FAILED` audit row and (were structured logging added to that
path) the corresponding log line — so a support engineer can find "every
record produced by this one request" across both systems. Not yet
threaded through every audit-writing action; extending it project-wide
(e.g. one correlation ID per Server Action invocation, via `AsyncLocalStorage`
or an explicit parameter) is a reasonable Phase 3+ enhancement, not
required by anything in V1.0's actual workflows yet.

## Vs. structured logging

`lib/logging/logger.ts` is a *separate* concern: JSON-line operational
output (`{ timestamp, severity, operation, correlationId?, context? }`)
for an operator reading stdout or a log aggregator — not a queryable
business record, not shown in any UI, not durable in the database.
`handleActionError` (`lib/errors/handleAction.ts`) is the main caller:
every unexpected (non-`AppError`) exception in a Server Action gets
logged here with full detail before being replaced with a generic
message for the client. No external logging library — at this scale a
thin wrapper over `console` is the whole requirement; see the doc comment
at the top of `lib/logging/logger.ts` for the "why not pino/winston"
reasoning.

## Testing

`tests/integration/auth.test.ts`, `users-actions.test.ts`, and
`change-password.test.ts` each assert the relevant audit entries exist
with correct `action`/`entityId`/`metadata`, and that failed operations
write none. See
[`docs/PHASE_2_IMPLEMENTATION_REPORT.md`](PHASE_2_IMPLEMENTATION_REPORT.md)
for the full inventory.
