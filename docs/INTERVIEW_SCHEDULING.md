# Interview Scheduling

Release 1 — Enterprise Functional Specification Addendum, Module 1.
Everything that turns an interview with an assigned panel (Release 1
Module 1, `panelAssignmentService`) into a confirmed, time-boxed meeting:
panellist availability, candidate-slot generation, applicant self-
booking via a secure token (see
[ADR-0017](adr/ADR-0017-interview-booking-token-access.md)), Secretariat
confirmation, the Microsoft Teams link, and invitation/reminder
recording.

All of this lives in `modules/interviews/{domain,repositories,services}`
plus three route surfaces: `app/(dashboard)/interviews/availability`
(panellist), `app/(dashboard)/interviews/scheduling` (Secretariat), and
`app/(auth)/interview/book/[token]` (public, unauthenticated applicant).

## Business rules (§1, verbatim, and where each is enforced)

| Rule | Enforced by |
|---|---|
| Programme Secretariat configures period/duration/buffer/daily-max | Configuration Centre settings — `interview.duration_minutes`, `interview.buffer_minutes`, `interview.max_interviews_per_day` (all newly wired to a real consumer this module; previously declared with zero consumer) |
| Panellists submit availability/unavailability/leave, every modification audited | `schedulingService.submitAvailability`/`removeAvailability`, `INTERVIEW_AVAILABILITY_SUBMITTED`/`_UPDATED` audit actions |
| Generate slots only where all assigned panellists are simultaneously available | `modules/interviews/domain/slotGeneration.ts` — pure interval-intersection math, unit-tested in isolation |
| Slot size = duration + mandatory buffer, no overlaps | `sliceIntoBlocks` — fixed-size, non-overlapping blocks by construction |
| Max 4 confirmed interviews per day, cohort-wide; prevent overbooking; prevent accidental override | `excludeFullDays` (generation-time exclusion) + `confirmBooking`'s status-conditioned update (a day that fills up between generation and confirmation still can't be double-booked, since the count is read fresh at generation time and confirmation only ever finalizes a slot that was already offered) |
| Applicant views/selects one slot, submits a booking request | `app/(auth)/interview/book/[token]` + `schedulingService.bookSlot` — public, token-scoped (ADR-0017) |
| Applicants may never hold multiple interview bookings | `bookSlot`'s status-conditioned update — a second booking attempt while `bookingStatus` is anything other than `SLOTS_PUBLISHED` fails with `ConflictError` |
| Booking does not confirm the interview; Secretariat must confirm/decline/request another slot | `InterviewBookingStatus`'s `PENDING_CONFIRMATION` state + `confirmBooking`/`declineBooking`/`requestAnotherSlot` |
| Teams link mandatory before invitations, Secretariat pastes it or syncs a real Teams meeting, URL validated | `setTeamsLink` (URL-shape validation, requires `CONFIRMED` status first) + `sendInvitations` (`ValidationError` unless a manual link or a `SYNCED` Teams meeting exists — see [docs/TEAMS_INTEGRATION.md](TEAMS_INTEGRATION.md)) |
| Invitations sent to applicant + 4 panellists + Secretariat | `sendInvitations`'s audit metadata records the full recipient list; the applicant additionally receives a real `INTERVIEW_INVITATION` email — see "Notification delivery" below |
| Automatic, configurable reminders (72h/24h/1h before) | `sendDueReminders` + `interview.reminder_hours_before` setting (default `"72,24,1"`) — see "Notification delivery" below |

## Scheduling status machine

`InterviewBookingStatus`:

```
AWAITING_SLOTS ──▶ SLOTS_PUBLISHED ──▶ PENDING_CONFIRMATION ──▶ CONFIRMED
                        ▲                      │
                        └──────────────────────┘
                     (declined / another slot requested)
```

`AWAITING_SLOTS` is the default for every newly-created Interview shell
(`Interview.scheduledAt` is nullable specifically for this — see the
schema doc comment on `Interview`). `generateSlotsForInterview` is
idempotent and can be called again from any status before
`PENDING_CONFIRMATION` — it always replaces the current `OPEN` candidate
slots, never touches `SELECTED`/`CANCELLED` historical ones.
`declineBooking`/`requestAnotherSlot` both reset `PENDING_CONFIRMATION`
back to `SLOTS_PUBLISHED`, cancelling the previously-selected slot
(never deleting it — full history stays in `InterviewSlot`) and
requiring a reason, audited under distinct action names
(`INTERVIEW_BOOKING_DECLINED` vs `INTERVIEW_RESELECTION_REQUESTED`) so
the two Secretariat intents (§1.6: "Decline" vs "Request another slot")
remain distinguishable in the audit trail even though their mechanics
are identical.

## Slot generation

`modules/interviews/domain/slotGeneration.ts` is a pure pipeline, no I/O:

1. `effectiveAvailability` — subtracts every `UNAVAILABLE`/`LEAVE` window from a panellist's `AVAILABLE` windows.
2. `intersectAllPanelists` — the overlap across *all* of an interview's assigned panellists simultaneously, not just any pair.
3. `sliceIntoBlocks` — chops the intersected time into fixed `duration + buffer` blocks (default 30 + 5 = 35 minutes), keeping only blocks that fit entirely inside a window.
4. `excludeFullDays` — drops any block on a calendar day already at the cohort-wide daily cap.

`schedulingService.generateSlotsForInterview` wires this to real data:
the interview's currently-`ASSIGNED` panellists, their
`InterviewerAvailability` rows for the cohort, the three Configuration
Centre values, and a fresh count of confirmed interviews per day.

## Applicant booking (ADR-0017)

No applicant-facing authentication exists in this codebase (`Role.FELLOW`
is excluded from `ASSIGNABLE_ROLES` in V1 — the Fellow Portal is a V2
decision, unchanged). Booking is instead a secure, single-purpose,
token-scoped public route: `publishSlots` generates a token, stores only
its SHA-256 hash (`Interview.bookingTokenHash`) with an expiry
(`interview.booking_token_ttl_hours`, default 7 days), and returns the
raw token once for the Secretariat to send manually — the same no-
automated-delivery boundary the rest of this module operates under (see
"Known limitation" below). `app/(auth)/interview/book/[token]/page.tsx`
never calls `requireSession`/`requirePermission` — the token itself is
the caller's entire identity, and the service functions behind it
(`getBookingPageData`, `bookSlot`) only ever accept `(token, slotId)`, so
there is no code path that could expose another interview's data.

## Interviewer capacity vs panel-scheduling capacity

This module's daily-capacity check (§1.4, "4 applicants per day") is
**cohort-wide interview-day capacity**, a distinct concept from
`InterviewerCapacity.maxConcurrentInterviews` (Release 1 Module 1 — one
interviewer's concurrent-panel-seat limit). Both are real, both matter,
and neither substitutes for the other: a day could have room under the
daily cap while a specific panellist is individually over capacity (that
panellist simply wouldn't appear in the intersected-availability
candidates for a new interview), and vice versa.

## Notification delivery

Real outbound email now exists (`modules/notifications`, see
[docs/NOTIFICATIONS.md](NOTIFICATIONS.md)) and this module calls into it (Interview
Module Completion, Planning Phase 2):

- **Booking links** are still shown once to the Secretariat to copy and send themselves
  (see ADR-0017) — the booking token itself is never emailed, only the confirmed
  interview details are.
- **Invitations** (`sendInvitations`) write `Interview.invitationsSentAt` and an audit
  entry listing every recipient, exactly as before, and additionally enqueues a real
  `INTERVIEW_INVITATION` email to the applicant (date/time/timezone/Teams join link) via
  `notifyApplicantSafely` — a try/catch wrapper around `enqueueNotification` that logs
  and swallows any failure (missing template, `feature.notifications` off, Graph not
  configured) so a notification problem can never block the actual invitation record.
- **Reminders** (`sendDueReminders`) scan confirmed, invited interviews and, for any
  configured threshold (`interview.reminder_hours_before`, default `"72,24,1"`) just
  crossed, both write the existing audit entry (idempotency check: no duplicate reminder
  for the same interview/threshold pair) and enqueue a real `INTERVIEW_REMINDER` email
  via the same safe wrapper.
- **Scheduling**: `app/api/cron/process-notifications` (bearer-token authenticated,
  `NOTIFICATIONS_CRON_SECRET`) calls `sendDueReminders()` then
  `processDueNotifications()` on every invocation — there is still no persistent
  background job runner in this codebase; an external scheduler must call this endpoint
  periodically.

## Audit actions (this module's additions to `lib/audit/actions.ts`)

`INTERVIEW_AVAILABILITY_SUBMITTED`, `INTERVIEW_AVAILABILITY_UPDATED`,
`INTERVIEW_SLOTS_GENERATED`, `INTERVIEW_SLOTS_PUBLISHED`,
`INTERVIEW_SLOT_BOOKED`, `INTERVIEW_BOOKING_CONFIRMED`,
`INTERVIEW_BOOKING_DECLINED`, `INTERVIEW_RESELECTION_REQUESTED`,
`INTERVIEW_TEAMS_LINK_ADDED`, `INTERVIEW_INVITATIONS_SENT`,
`INTERVIEW_REMINDER_SENT`.

## Permissions (this module's additions to `lib/permissions/catalog.ts`)

`interview_availability.manage` (self-only, granted to `INTERVIEWER`),
`interview_scheduling.manage` (granted to `PROGRAMME_SECRETARY`/
`SYSTEM_ADMIN`, the same operator role as the Panel Assignment Engine's
`interview_assignments.manage`). The public booking route has no
permission at all — see ADR-0017.

## Attendance

`recordAttendance` (Interview Module Completion, Planning Phase 2) lets the Secretariat
record `PRESENT | LATE | ABSENT | TECHNICAL_ISSUE | RESCHEDULED | CANCELLED` plus an
optional note against a `CONFIRMED` booking, audited as
`INTERVIEW_ATTENDANCE_RECORDED`. Surfaced on the scheduling detail page. See
[docs/INTERVIEW_QUESTIONS.md](INTERVIEW_QUESTIONS.md#attendance).

## Not built this module

Workload analytics, CSV export, and a richer schedule dashboard remain a later,
separate scope item — the screens here (plus attendance recording, above) are the
minimum needed to operate the scheduling workflow end-to-end, not that workspace.
