# Reassignment Workflow (Secretariat)

The reassignment dialog on `/review-operations/assignments/
[applicationId]` is a UI on top of Phase 3B's assignment engine — this
phase adds **no new reassignment logic**, per the brief's explicit "use
the Phase 3B reassignment engine" instruction.

## Flow

1. The page filters an application's assignments down to
   `REASSIGNABLE_STATUSES` (`ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`) —
   `PENDING`/`SUBMITTED`/`ESCALATED`/`COMPLETED` assignments are shown
   elsewhere on the page (for oversight) but never offered as
   reassignment candidates.
2. `ReassignDialog` (`app/(dashboard)/review-operations/assignments/
   [applicationId]/reassign-dialog.tsx`) requires: the current
   assignment, a replacement reviewer, and a reason (client-side
   `minLength={10}`, matching the server's Zod schema).
3. `reassignAssignmentAction` (`actions.ts`) — `requireSession()`, Zod-
   validate, call `assignmentService.reassignAssignment(actorId,
   { assignmentId, newReviewerId, reason })` (Phase 3B, unchanged),
   translate any thrown error to an inline `{ error }`.

## Guarantees (enforced by Phase 3B's `reassignAssignment`, not re-implemented here)

- **`assignments.reassign` permission**, re-checked server-side
  (`requirePermission`) regardless of what the dialog's own UI state
  implies.
- **Same reviewer again** — rejected (`newReviewerId === reviewerId`
  throws `ConflictError`) before anything else runs.
- **Valid state transition** — `assertAssignmentTransition` rejects
  reassigning an assignment not currently in a reassignable status,
  independent of what the UI already filtered.
- **Conflicted / inactive / over-capacity / unauthorised reviewer** —
  the replacement reviewer goes through the exact same eligibility
  filter (`filterEligibleReviewers`) the original auto-assignment engine
  uses, built from a real snapshot of that reviewer's current
  conflicts/capacity/status, not a cached or client-supplied list. The
  dialog's own "available reviewers" list is a convenience for the
  Secretary — the server independently re-derives eligibility regardless
  of what was offered on screen (stated directly in the dialog's own
  helper text).
- **Assignment history preserved, never overwritten** — the old
  `ReviewAssignment` row transitions to `REASSIGNED` (its `reviewerId`
  untouched, so the record of who originally held it survives); a *new*
  row is created for the replacement reviewer with
  `reassignedFromId` pointing back at it. Both happen inside one
  `prisma.$transaction`, so a failure partway never leaves an
  application with two simultaneously-active assignments in the same
  slot or with neither.
- **Audit record** — `ASSIGNMENT_REASSIGNED` (Phase 3B's existing audit
  action), recording the reason, the outgoing/incoming reviewer, the
  slot, and both assignment IDs.

## What the Secretariat cannot do through this dialog

- Reassign to a status other than the three reassignable ones listed
  above — a completed or already-submitted review has nothing to
  reassign into (there is no "undo a submission" action anywhere in this
  codebase).
- Self-assign — the dialog offers only `availableReviewers`
  (`listActiveApplicationReviewers`, role `APPLICATION_REVIEWER`); a
  Secretary's own account, holding `PROGRAMME_SECRETARY`, is never in
  that list, and the server-side eligibility filter (§ above) would
  reject it independently even if the client were tampered with.

## Testing

`tests/integration/reviewOperations.test.ts` performs an actual
`reassignAssignment` call (not a permission-list assertion) and checks:
the old assignment's status is `REASSIGNED`, its `reviewerId` is
unchanged, and the new assignment correctly points back via
`reassignedFromId`. `tests/e2e/reviewOperations.spec.ts` drives the same
flow through a real browser — opening the dialog, selecting an
assignment and a replacement reviewer, submitting a reason, confirming
the success toast — then independently re-queries the database (via the
fixture-management subprocess, since Playwright specs can't import
Prisma directly — see `docs/PROGRAMME_SECRETARIAT_WORKSPACE.md`) to
confirm the same history-preservation guarantee holds end-to-end,
through the UI, not just at the service layer.
