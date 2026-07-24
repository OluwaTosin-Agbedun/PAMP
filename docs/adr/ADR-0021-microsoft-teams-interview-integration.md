# ADR-0021: Microsoft Teams Interview Integration

**Status:** Accepted
**Date:** 2026-07-22
**Context:** FMS Development Instruction — Microsoft Teams Interview Integration and Eligibility Screening Configuration (Workstream One)

## Context

Interview sessions had exactly one meeting-link mechanism before this
change: `Interview.teamsLink`, a Secretariat member manually pastes a
URL (`schedulingService.ts#setTeamsLink`). Nothing creates or manages a
real Microsoft Teams meeting. The brief asks for real Graph-backed
meetings — organiser account, title/participants/date/time/timezone,
join link, sync status — with reschedule/cancel updating the same
meeting rather than duplicating it, an explicit distinction from the
manual fallback, and failure/retry handling that never silently claims
success. It also requires Microsoft credentials to live only in
environment configuration and tokens to never be persisted.

## Decision

1. **A new `InterviewTeamsMeeting` model, 1:1 with `Interview`, kept
   entirely separate from `teamsLink`.** Rather than repurposing
   `teamsLink`/`teamsLinkAddedAt`/`teamsLinkAddedById` to also carry
   sync state, a new model holds `graphEventId`, `joinUrl`,
   `organiserUpn`, `syncStatus`, `lastSyncedAt`/`lastAttemptedAt`,
   `failureReason`, `retryCount`. Two separate fields, never one
   overloaded field, is how "distinguish an explicit manual-link
   fallback from a real synced meeting" gets enforced at the schema
   level, not just by UI convention — a `FAILED`/`PENDING` sync can
   never be mistaken for a live meeting, because `joinUrl` on this model
   is only ever set by a confirmed Graph success.

2. **The Calendar Events API (`/users/{upn}/events`,
   `isOnlineMeeting: true`), not the standalone Online Meetings API
   (`/users/{upn}/onlineMeetings`).** The events endpoint accepts
   subject/attendees/start/end/timeZone in one call and returns
   `onlineMeeting.joinUrl` on the same response — exactly the "title,
   participants, date, time, timezone" fields the brief lists, with one
   round trip instead of two (create a meeting, then a calendar event
   referencing it). Reschedule and cancel act on this same event via
   `PATCH`/`POST .../cancel`.

3. **`organiserUpn` is a plain string, not a `User` relation.** The
   organiser is one fixed Microsoft 365 mailbox from
   `MS_GRAPH_ORGANISER_UPN` — a shared/service account, not necessarily
   any individual FMS user's own Microsoft identity. Forcing a `User`
   foreign key would imply a 1:1 mapping between FMS accounts and
   Microsoft accounts that this integration doesn't require or assume.

4. **`GraphMeetingClient` is an interface (`lib/msgraph/client.ts`),
   and `teamsMeetingService.ts` calls `getGraphClient()` to obtain one**
   rather than accepting it as a constructor/function parameter. Tests
   substitute a fake by mocking the module
   (`vi.mock("@/lib/msgraph/client")`) — the same pattern this codebase
   already uses for other request-scoped externals (`tests/integration/
   users-actions.test.ts` mocks `@/lib/auth/auth` identically). This
   keeps the service's public function signatures free of a test-only
   parameter while still making the real HTTP client fully swappable,
   satisfying "must never call live Microsoft services in the normal
   test suite" without introducing a DI container or factory pattern
   this codebase doesn't otherwise use.

5. **`getGraphClient()` returns `null` when unconfigured, rather than
   throwing.** An unconfigured environment (e.g. local dev) is an
   expected, routine state, not an exceptional one — `teamsMeetingService.ts`
   checks for `null` and records a clear `FAILED`/"not configured" state
   before throwing `GraphNotConfiguredError` to the caller. The access
   token itself, once obtained, lives only in an in-memory module-level
   variable (`cachedToken`) — never written to `InterviewTeamsMeeting`,
   a log line, or an audit entry.

6. **Reschedule and cancel are new capabilities on `Interview`
   (`cancelledAt`/`cancelledById`/`cancellationReason`, plus reusing
   `scheduledAt`), distinct from the pre-existing `declineBooking`/
   `requestAnotherSlot`.** Those two only ever reset a *pending*
   applicant booking back to `SLOTS_PUBLISHED` — they never end a
   confirmed interview. Overloading them to also mean "cancel outright"
   would have made an already-confirmed interview's cancellation
   indistinguishable from an applicant simply being asked to pick
   another slot. `cancelInterview` sets `Interview.status = CANCELLED`
   (the pre-existing enum value, never used until now) and, if a
   Graph meeting exists, cancels the same event.

7. **A sync/cancel failure never blocks the FMS-side action it's
   attached to.** Rescheduling always saves the interview's new
   `scheduledAt`, and cancelling always sets `Interview.status =
   CANCELLED`, even if the corresponding Graph call fails — the
   alternative (blocking the whole action on an external API call)
   would let a Microsoft outage prevent Secretariat staff from managing
   their own schedule. The Graph-side failure is always reported back
   in the result (`teamsSynced: false` / `teamsMeetingCancelled: false`
   plus an error string) rather than either blocking the action or
   being silently dropped — the FMS record and the live Teams meeting
   are two different facts, and this integration never conflates them.

8. **New permissions only for genuinely new capabilities.**
   `INTERVIEW_TEAMS_MEETING_CREATE`, `INTERVIEW_TEAMS_SYNC_RETRY`,
   `INTERVIEW_TEAMS_LINK_VIEW`, `INTERVIEW_CANCEL`. "Create
   interview"/"Assign panel" reuse `INTERVIEW_ASSIGNMENTS_MANAGE`;
   "Reschedule"/"Enter manual link"/"Send notifications" reuse
   `INTERVIEW_SCHEDULING_MANAGE` — both pre-existing and already scoped
   to the Programme Secretariat. Inventing a new permission for every
   noun in the brief's capability list would have fragmented a
   coherent operator role for no enforcement benefit; a new permission
   was added only where the brief calls out a capability this codebase
   had no existing permission for.

## Consequences

- `docs/TEAMS_INTEGRATION.md` documents the full flow, permission
  table, and audit events.
- The pre-existing manual `teamsLink` path is untouched — it remains
  available exactly as it worked before, for any environment without
  Microsoft Graph configured, or as a fallback when a sync fails.
- `tests/integration/teamsMeetingService.test.ts` is the first place in
  this codebase to mock an external HTTP-backed client at the module
  boundary; the pattern (mock the client module, inject a `GraphMeetingClient`-
  shaped fake via `vi.mocked(getGraphClient).mockReturnValue(...)`) is
  reusable for any future external integration.

## Alternatives considered

- **Repurposing `teamsLink` to also track sync state**: rejected — see
  Decision §1; would blur the exact distinction the brief asks for.
- **The standalone Online Meetings API instead of Calendar Events**:
  rejected — two API calls instead of one, and the events API's
  `attendees`/`start`/`end` fields map directly onto the brief's
  required fields with no extra modelling.
- **A DI parameter (`client?: GraphMeetingClient`) on every service
  function**: rejected — see Decision §4; module-mocking matches an
  existing precedent in this codebase and keeps the public API clean.
- **Blocking the FMS-side reschedule/cancel on Graph success**:
  rejected — see Decision §7; would make a Microsoft-side outage able
  to block Secretariat staff from managing interviews they otherwise
  have every right to change.
