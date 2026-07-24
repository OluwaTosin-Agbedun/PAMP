# Notification Infrastructure

Real outbound email delivery via Microsoft Graph Mail, plus the outbox,
templates, and delivery monitoring that make it observable and
recoverable. This is Phase 1 of the approved Interview/Notifications/
Executive Dashboard/Analytics planning document — infrastructure only.
Wiring every module's own events to it (Interview reminders,
Application Review outcomes, Offers) is separate, later work; see
"What's wired today" below for exactly what fires a real email right
now.

## Two separate notification systems, on purpose

| | `Notification` (pre-existing) | `OutboundNotification` (new) |
|---|---|---|
| Audience | Signed-in FMS staff | An `Applicant` (no login) or a `User` |
| Delivery | In-app bell icon only | Real email, via Microsoft Graph Mail |
| Shape | title/body, read/unread | template, variables, status, retries, provider message ID |

They're kept separate rather than merged into one table — a staff
member's bell-icon alert and a templated, retried, audited outbound
email are different enough shapes that forcing one model to cover both
would distort one of them. See `prisma/schema.prisma`'s own doc
comments on both models.

## The event catalogue

`modules/notifications/eventCatalogue.ts` — every event Programme
Identity §10 and this planning instruction's §5.1 name, applicant-
facing and internal, each with its recipient kind and the exact
`{{placeholders}}` its default template may use. A `string`, not a
database enum — a new event never needs a migration.

**Cataloguing an event does not mean something fires it yet.** As of
Phase 1, exactly five events have a real trigger point:

| Event | Fires from |
|---|---|
| `ELIGIBLE` | `screeningService.ts#markEligible` |
| `INELIGIBLE` | `screeningService.ts#markIneligible` |
| `DISQUALIFIED` | `screeningService.ts#markDisqualified` |
| `ELIGIBILITY_CLARIFICATION_REQUIRED` | `screeningService.ts#requestClarification` |
| `ELIGIBILITY_CLARIFICATION_RESOLVED` | `screeningService.ts#resolveClarification` |

Every other catalogued event (Interview invitations/reminders,
Shortlisted/Reserve, Offers, integrity/reviewer-conflict internal
alerts, and so on) has a definition and a default template ready, but
nothing in the codebase enqueues it yet — that's each module's own
later step, not invented here ahead of a real trigger point existing.

## Never internal content to an applicant

`OutboundNotification` has two separate free-text fields:
`internalComment` (staff-only, never rendered into the sent message)
and `applicantFacingComment` (safe to include). A template can only
ever reference variables the event's own catalogue entry declares —
`INELIGIBLE`'s catalogue entry, for example, deliberately has no
"reason" placeholder at all, so a screener's internal
`reasonForDecision` structurally cannot leak into that email; only
`ELIGIBILITY_CLARIFICATION_REQUIRED`'s `outstandingClarification`
is forwarded, because that field is applicant-facing by the checklist's
own design (the screener writes it *to* the applicant), unlike
`reasonForDecision`/`integrityNote` elsewhere.

## How a send actually happens

`modules/notifications/services/notificationService.ts#enqueueNotification`:

1. Validates the event is known and deduplicates — a second enqueue for
   the same `(event, recipient, relatedEntityType, relatedEntityId)`
   while a prior one is still live (not `FAILED`/`CANCELLED`) is a
   no-op, returning the existing row.
2. Always creates an `OutboundNotification` row — even if the recipient
   has no valid email (`FAILED` immediately, clear reason, never
   attempted) or the feature is disabled (attempted, then `FAILED` with
   a clear reason) or Microsoft Graph isn't configured (same). **A
   notification is never silently lost** — every outcome is a row on
   the delivery monitoring screen.
3. An immediate (non-scheduled) notification is attempted right away.
   A scheduled one (a future reminder) waits for the external
   scheduler — see below.
4. A send failure increments `retryCount`; if under
   `notification.retry_limit` (Configuration Centre, default 3) it's
   marked `RETRYING` with an exponential backoff (capped at 60
   minutes) and picked up by the next processor run; past the limit
   it's a terminal `FAILED`, retryable manually from the delivery
   monitoring screen.

## No persistent background process

This codebase runs no queue worker or cron daemon — nothing fires a
scheduled notification on its own. `POST /api/cron/process-notifications`
(bearer-token authenticated via `NOTIFICATIONS_CRON_SECRET`, see
[docs/ENVIRONMENT_CONFIGURATION.md](ENVIRONMENT_CONFIGURATION.md)) must
be called on an interval by an external scheduler — Vercel Cron, a
GitHub Action, any periodic pinger. A 5-minute interval is a reasonable
default for interview reminders once those are wired (Phase 2); nothing
about the endpoint itself requires a particular interval. The same call
also runs `checkMissedClarificationDeadlines`
(see [ELIGIBILITY_SCREENING.md](ELIGIBILITY_SCREENING.md)'s
"Clarification deadline" section) before draining the outbox, so a
missed eligibility clarification window is enforced on the same
interval as everything else here.

## Provider: Microsoft Graph Mail

`lib/msgraph/mailClient.ts`, sharing tenant authentication with the
Teams integration (`lib/msgraph/token.ts` — one client-credentials
token, cached in memory, never persisted). Needs the `Mail.Send`
application permission granted alongside Teams' calendar permission, on
the same app registration. Sends plain text only, deliberately — a
Configuration-Centre-editable template must never carry HTML/script
content (§5.4: "Do not allow administrators to place unsafe executable
content in templates").

## Configuration Centre

`/administration/configuration/notification` (the existing flat
settings category, Release 1.5): sender name, reply-to address,
delivery retry limit. `/administration/notifications/templates`
(dedicated screen, `NOTIFICATIONS_ADMINISTER`): every event's current
subject/body, an editor that publishes a new template version (the
exact wording actually sent for a past notification is never rewritten
retroactively), and a "send test" action that delivers the current
template with sample placeholder values without touching the outbox at
all.

## Delivery monitoring

`/administration/notifications` (`NOTIFICATIONS_ADMINISTER`): every
outbound notification, filterable by status/event/search, with the
failure reason and retry count visible inline. Retry (from `FAILED`
only), Cancel (from `PENDING`/`SCHEDULED` only — a `PROCESSING` or
already-`SENT` row can't be cancelled), and Resend (from any status —
creates a fresh row rather than mutating history) are all audited.

## Permissions

| Permission | Who | Covers |
|---|---|---|
| `NOTIFICATIONS_VIEW` (pre-existing) | Broadly granted | A user's own in-app `Notification` bell |
| `NOTIFICATIONS_ADMINISTER` (new) | Programme Secretariat, Director/Admin (oversight) | Templates, delivery monitoring, retry/cancel/resend, test email |

## Audit events

`NOTIFICATION_ENQUEUED`, `NOTIFICATION_SENT`, `NOTIFICATION_FAILED`,
`NOTIFICATION_RETRIED`, `NOTIFICATION_RESENT`,
`NOTIFICATION_CANCELLED`, `NOTIFICATION_TEMPLATE_UPDATED`,
`NOTIFICATION_TEST_SENT`.

## Testing

`tests/unit/notificationTemplateRendering.test.ts`,
`notificationOutboundTransitions.test.ts` — pure-function coverage of
placeholder substitution and status transitions.
`tests/integration/notificationService.test.ts` runs every scenario
against a fake `MailSendClient` (`vi.mock("@/lib/msgraph/mailClient")`)
— the real HTTP implementation is never invoked in the automated suite.
Covers: successful immediate send, invalid-email short-circuit (never
attempts delivery), the feature-flag-disabled path, a genuine send
failure recorded and retried, duplicate-send prevention, the internal
comment never appearing in the rendered/sent message, cancel's status
guard, retry, resend, and the due-notification processor only picking
up rows that are actually due.
