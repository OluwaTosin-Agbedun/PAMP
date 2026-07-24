# Microsoft Teams Interview Integration

Interview sessions can have a real, Microsoft Graph-backed Teams
meeting created and kept in sync automatically, instead of relying on a
Secretariat member to manually paste a link. This is additive to the
existing manual entry, not a replacement for it — the two are
deliberately kept distinguishable everywhere in the data model and UI.

## Two distinct kinds of meeting link

| | `Interview.teamsLink` (pre-existing) | `InterviewTeamsMeeting` (new) |
|---|---|---|
| Source | Typed in by a Secretariat member | Created via Microsoft Graph |
| Backed by a real Graph event | No | Yes (`graphEventId`) |
| Kept in sync on reschedule | No — must be re-entered manually | Yes — the same Graph event is updated |
| Cancelled automatically on interview cancel | No | Yes |
| Sync status tracked | N/A | `PENDING`/`SYNCED`/`FAILED`/`CANCELLED` |

The scheduling workspace shows both, clearly labelled — the manual link
as "fallback," the synced meeting with its live sync-status badge. A
panellist's own interview page (`interviews/[interviewId]`) prefers the
synced `joinUrl` when one exists, falling back to the manual link, so a
panellist is never sent to a stale link once a real meeting exists.

## Configuration

Four environment variables, all required together — see
[docs/ENVIRONMENT_CONFIGURATION.md](ENVIRONMENT_CONFIGURATION.md):
`MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`,
`MS_GRAPH_ORGANISER_UPN`. No Microsoft credential is ever hard-coded or
stored in the database — `lib/msgraph/client.ts` reads them from
`process.env` only, and the OAuth2 access token it obtains (client-
credentials flow) lives in an in-memory module variable, never
persisted, logged, or written to an audit entry.

If any variable is missing, `isGraphConfigured()`/`getGraphClient()`
report "not configured" — every create/retry attempt fails clearly
(`GraphNotConfiguredError`) with the attempt still recorded (`FAILED`,
with a failure reason), rather than silently doing nothing or pretending
to succeed.

## How a meeting is created

`modules/interviews/services/teamsMeetingService.ts#createOrSyncTeamsMeeting`
(`INTERVIEW_TEAMS_MEETING_CREATE`, Programme Secretariat):

1. The interview must be `bookingStatus: CONFIRMED` with a `scheduledAt`
   set — the same precondition `setTeamsLink` (the manual path) already
   enforces.
2. Builds the meeting request: subject (`"PAM-P Interview — {applicant
   name}"`), start/end from `scheduledAt`/`durationMinutes`, time zone
   from the `interview.timezone` setting (Configuration Centre,
   default `Africa/Lagos`), and attendees (the applicant plus every
   `ASSIGNED` panellist).
3. Calls Microsoft Graph's calendar events API
   (`POST /users/{organiserUpn}/events`, `isOnlineMeeting: true`,
   `onlineMeetingProvider: "teamsForBusiness"`) — this both creates a
   calendar event under the configured organiser mailbox and its
   attached Teams meeting in one call, returning the join URL.
4. On success: `InterviewTeamsMeeting.syncStatus = SYNCED`,
   `graphEventId`/`joinUrl` stored, `INTERVIEW_TEAMS_MEETING_CREATED`
   audited, an in-app `Notification` sent to each panellist.
5. On any failure — Graph unreachable, rejected the request, not
   configured — `syncStatus = FAILED`, `failureReason` and `retryCount`
   recorded, `INTERVIEW_TEAMS_SYNC_FAILED` audited, and the error is
   **always re-thrown to the caller**. This module never reports success
   it didn't actually achieve.

## Reschedule and cancel update the same meeting

Rescheduling (`rescheduleInterview`, `INTERVIEW_SCHEDULING_MANAGE`)
updates `Interview.scheduledAt` and — if a Teams meeting already exists
for this interview, synced or previously failed — re-attempts the sync.
Because `InterviewTeamsMeeting.graphEventId` is already known, this
calls Graph's `PATCH` on the same event, never `POST`-ing a new one, so
a rescheduled interview never ends up with two competing meetings. The
interview's new time is saved even if the Graph re-sync itself fails —
the caller gets back `{ teamsSynced: false, teamsSyncError }`, never a
result that silently claims both succeeded.

Cancelling (`cancelInterview`, `INTERVIEW_CANCEL` — a new capability,
distinct from the pre-existing `declineBooking`/`requestAnotherSlot`,
which only ever reset a *pending* applicant booking, never end a
confirmed interview) sets `Interview.status = CANCELLED` and, if a
synced meeting exists, cancels the same Graph event
(`POST /events/{id}/cancel`, which notifies attendees). The interview
is always cancelled once permitted and valid; if the Graph cancellation
itself fails, that's reported back (`teamsMeetingCancelled: false`,
`teamsCancelError`) rather than hidden — cancelling the FMS record and
actually removing the meeting from the organiser's calendar are two
different facts, and this module never conflates them.

## Retry

A `FAILED` sync can be retried (`retryTeamsMeetingSync`,
`INTERVIEW_TEAMS_SYNC_RETRY`) — `retryTeamsMeetingSync` refuses to run
if there's no existing `FAILED` row, and its own
`INTERVIEW_TEAMS_SYNC_RETRIED` audit entry (alongside the normal
create/update audit) makes a retry distinguishable from the original
attempt in the Audit Trail.

## Permissions

| Permission | Who | Covers |
|---|---|---|
| `INTERVIEW_TEAMS_MEETING_CREATE` | Programme Secretariat | Create/re-sync a Teams meeting |
| `INTERVIEW_TEAMS_SYNC_RETRY` | Programme Secretariat | Retry a failed sync |
| `INTERVIEW_TEAMS_LINK_VIEW` | Programme Secretariat, Interviewer (own interview), Director/Admin (oversight) | View the join link |
| `INTERVIEW_CANCEL` | Programme Secretariat | Cancel an interview outright |

"Create interview"/"Assign panel" reuse the pre-existing
`INTERVIEW_ASSIGNMENTS_MANAGE`; "Reschedule"/"Enter manual
link"/"Send notifications" reuse the pre-existing
`INTERVIEW_SCHEDULING_MANAGE` — new permissions were added only for
the genuinely new Teams-specific capabilities, per this codebase's
existing least-privilege convention (see docs/RBAC.md).

## Audit events

`INTERVIEW_TEAMS_MEETING_CREATED`, `INTERVIEW_TEAMS_MEETING_UPDATED`,
`INTERVIEW_TEAMS_MEETING_CANCELLED`, `INTERVIEW_TEAMS_SYNC_FAILED`,
`INTERVIEW_TEAMS_SYNC_RETRIED`, `INTERVIEW_RESCHEDULED`,
`INTERVIEW_CANCELLED`. No audit metadata ever includes a Microsoft
access token or client secret — only the Graph event ID (not a
credential) and sanitised error text (`lib/msgraph/client.ts`'s
`parseGraphError` strips the raw Graph response body, keeping only its
top-level error message).

## Notifications

Staff (panellists) get an in-app `Notification` row on meeting
create/update and on interview cancellation. Real outbound email
infrastructure now exists (`modules/notifications`, see
[docs/NOTIFICATIONS.md](NOTIFICATIONS.md)) — but this module doesn't
call into it yet. Wiring interview invitations/reminders/reschedule/
cancellation notices to it is its own step (the Notification
Infrastructure planning document's Phase 2), not done as part of this
integration. Until then, applicant-facing messaging for interviews
stays audit-recorded intent only, the same established boundary
`sendInvitations` already uses.

## Testing

`tests/integration/teamsMeetingService.test.ts` runs every scenario
above against a fake `GraphMeetingClient` (`vi.mock("@/lib/msgraph/client")`)
— the real HTTP implementation is never invoked in the automated suite.
Covers: successful create, permission rejection, the "not configured"
path, a genuine Graph failure (never swallowed, always persisted and
rethrown), retry (blocked with nothing to retry, then succeeding),
reschedule re-using the same Graph event, reschedule surviving a sync
failure, cancel cancelling the Graph meeting, and cancel surviving a
Graph failure.
