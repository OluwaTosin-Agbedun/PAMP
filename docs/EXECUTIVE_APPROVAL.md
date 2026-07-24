# Executive Approval

FMS Development Planning Instruction, Planning Phases 3 and 4. Gives
the long-dormant `EXECUTIVE_APPROVE`/`EXECUTIVE_VIEW` permissions —
defined and granted to `Role.EXECUTIVE` since Version 1, never checked
by any route or service until now — their first real consumer: a
staged, server-authorised sign-off history on a `RankingSnapshot`
(Phase 3), surfaced through a real staff-facing dashboard at
`/executive-approval` (Phase 4).

## Not the same thing as `ExecutiveApproval`

The schema already contained an `ExecutiveApproval` model (and
`CommitteeVote`/`CommitteeDecision`/`AdmissionOffer` alongside it) —
scaffolded, permission-gated, and, like `EXECUTIVE_APPROVE` itself,
never consumed by any code path (confirmed: zero references anywhere in
`modules/` or `app/`). It is a **single, per-application** decision
(`applicationId String @unique`, `ExecutiveDecision`:
`APPROVED | RETURNED | CLARIFICATION_REQUESTED`) — most likely intended
for a later, individual admissions sign-off (Module 7/8 territory,
outside this instruction's five modules).

`RankingApprovalStage` is a different shape for a different question:
a **repeatable, cohort-wide, ordered gate history** on a whole
`RankingSnapshot` — the Programme Identity document's staged Top 70 →
Top 60 → Final Selection → Verification & Confirmation sign-off. Both
models are real, both stay, and a future reader should not assume one
supersedes the other.

## Schema

One migration
(`prisma/migrations/20260722220000_executive_approval_data_model`):

- `RankingApprovalStageType` enum: `TOP_70 | TOP_60 | FINAL_SELECTION | VERIFICATION_CONFIRMATION`.
- `RankingApprovalDecision` enum: `APPROVED | REJECTED`.
- `RankingApprovalStage`: `rankingSnapshotId` (FK, `onDelete: Cascade`),
  `stage`, `decision`, `approverId` (FK `User`), `comment` (nullable —
  required by the *service*, not the schema, when `decision = REJECTED`),
  `previousStatus`/`newStatus` (both computed strings, e.g.
  `"TOP_70_APPROVED"` — never user input), `createdAt`.

No `updatedAt` and no delete/edit path — a decision, once recorded, is
an immutable historical fact (matches `RankingTieResolution`'s
`resolvedById`/`resolvedAt` convention and every other append-only
approval record in this codebase). Re-deciding a stage doesn't edit the
old row; it inserts a new one, so the full history is always the
complete, ordered set of rows for a snapshot.

## Stage sequencing (`modules/executiveApproval/domain/executiveApproval.ts`)

Pure functions, no I/O:

- `APPROVAL_STAGE_ORDER` — the fixed four-stage sequence.
- `latestDecisionByStage(stages)` — folds a snapshot's full row history
  down to "what was most recently decided for each stage," by
  `createdAt`.
- `canDecideStage(stage, latest)` — a stage can be decided only if the
  stage immediately before it is currently `APPROVED` (unconditional for
  `TOP_70`, the first gate), and only if this stage itself isn't already
  `APPROVED` (an approved stage is final; a `REJECTED` one can be
  retried — e.g. after the Secretariat adjusts the underlying list).
- `workflowStatusFor(stage, decision)` — `` `${stage}_${decision}` ``,
  e.g. `"TOP_70_APPROVED"`.

## Service (`modules/executiveApproval/services/executiveApprovalService.ts`)

- `recordApprovalStageDecision(actorId, input)` — gated on
  `EXECUTIVE_APPROVE`. Server-authorised exactly like
  `approveFinalRanking`'s existing pattern (`modules/ranking`) — never a
  frontend-only toggle. Validates the snapshot exists, enforces the
  sequencing rule above (`ConflictError` if out of order or already
  approved), requires a comment on `REJECTED` (`ValidationError`),
  computes `previousStatus` from the snapshot's most recently created
  row (`null` for the very first decision ever recorded), and audits
  `RANKING_APPROVAL_STAGE_RECORDED`.
- `getApprovalStageHistory(actorId, rankingSnapshotId)` — gated on
  `EXECUTIVE_VIEW`, a standalone read of one snapshot's history (the
  full ordered row history plus a derived `currentStatus`,
  `"NOT_STARTED"` if nothing has been decided yet). The dashboard itself
  (below) inlines the equivalent logic directly in
  `getExecutiveDashboard` rather than calling this a second time, since
  it already has the stage rows from its own query.

## Permissions

No new permissions — this phase's entire point is to finally exercise
the ones already sitting there: `EXECUTIVE_APPROVE` (act, `Role.EXECUTIVE`
only — not even `Role.PROGRAMME_DIRECTOR`, who holds `EXECUTIVE_VIEW` for
global read visibility but never the approve action, the same
separation-of-duties split `RANKING_APPROVE`'s own placement already
uses) and `EXECUTIVE_VIEW` (read, granted to `EXECUTIVE`,
`PROGRAMME_DIRECTOR`, and `PROGRAMME_SECRETARY`).

## Audit

`RANKING_APPROVAL_STAGE_RECORDED` — `entityType: "RankingSnapshot"`,
metadata carries `stage`/`decision`/`comment`/`previousStatus`/`newStatus`.
One row per decision, same "current state on the row, full history in
the audit trail" split as every other approval in this codebase.

## Dashboard (`app/(dashboard)/executive-approval`, Planning Phase 4)

One page (`page.tsx`), gated on `EXECUTIVE_VIEW` at the route level via
`requirePagePermission` and again behind `feature.executive_dashboard`
(`layout.tsx`, `notFound()`-the-whole-subtree — same pattern
`feature.interview_module` established, but defaulting **off**: this
route never existed before Phase 4, so there's no "preserve existing
behaviour" to protect).

`getExecutiveDashboard(actorId, cohortId)`
(`modules/executiveApproval/services/executiveDashboardService.ts`)
returns everything the page needs in one call — the same "one workspace
call per page" shape `getRankingWorkspace`/`getReviewOperationsDashboard`
already established:

- Cohort-wide summary counts (total applications, eligibility
  breakdown, interview status breakdown) — fresh `groupBy` queries in
  `modules/executiveApproval/repositories/executiveDashboardRepository.ts`,
  written new rather than reused from any other module's in-flight,
  uncommitted dashboard work.
- The ranking entries themselves come straight from
  `getRankingWorkspace` (`modules/ranking`) — not a fresh query —
  specifically so this dashboard inherits that function's
  confidentiality shape: applicant name/pathway/rank/decision band
  only, never a reviewer identity or an individual reviewer's comment.
  This is what satisfies the acceptance criterion that an Executive (or
  a future Selection Committee view reusing the same data) never sees a
  blind reviewer's identity or another reviewer's private comment —
  the dashboard was never given a code path that *could* return that
  data in the first place, the same "can't leak what was never queried"
  discipline `docs/BLIND_REVIEW.md` describes for the reviewer side.
- `withinStageBracket(rank, stage, targetSize)`
  (`modules/executiveApproval/domain/executiveApproval.ts`) — the Top 70
  and Top 60 brackets are the literal fixed head-counts baked into the
  stage names themselves (`rank <= 70`, `rank <= 60`); Final Selection
  and Verification & Confirmation both mean "within the snapshot's
  actual `targetSize`" (e.g. 30) — Final Selection sets that list,
  Verification only re-confirms the same one.
- `nextActionableStage(latest)` — the one stage `canDecideStage` would
  currently allow, so the page shows exactly one decision form at a
  time rather than four.

`ApprovalWorkflowCard` (client component) renders the four stages with
their latest decision (approver, comment, timestamp) and, only for a
user holding `EXECUTIVE_APPROVE`, a form for the current
`nextActionableStage` — Approve/Reject plus a comment, mirroring
`TieResolutionCard`'s "server owns the rule, client only mirrors the
obvious part (comment required to submit Reject) and surfaces whatever
the server actually rejects" discipline. Submitting calls
`recordApprovalStageDecisionAction`
(`app/(dashboard)/executive-approval/actions.ts`), a thin Server Action
wrapping `recordApprovalStageDecision` — the workflow's actual
enforcement lives entirely in the service, never in the form.

Navigation: `lib/navigation.ts`'s "Executive Approval" taxonomy slot
(already reserved, `implemented: false`, since the Phase 3B.1
navigation reconciliation) is flipped to `true` — no new nav group, the
12-item taxonomy stays closed.

## Testing

`tests/unit/executiveApproval.test.ts` covers the pure sequencing logic
in isolation (blocked-until-prior-approved, already-approved-can't-
redecide, rejected-can-be-retried, multi-stage prerequisite chaining,
`nextActionableStage`'s single-actionable-stage-at-a-time guarantee, and
`withinStageBracket`'s fixed-vs-targetSize thresholds).
`tests/integration/executiveApproval.test.ts` covers the Phase 3 service
against a real `RankingSnapshot` (permission denial for a Director, the
full TOP_70 → VERIFICATION_CONFIRMATION sequence with `previousStatus`/
`newStatus` chaining and one audit row per decision, the mandatory-
comment-on-rejection rule and successful retry after rejection, and a
`NotFoundError` for a nonexistent snapshot).
`tests/integration/executiveDashboard.test.ts` covers the Phase 4
dashboard service (permission denial, summary counts before any ranking
exists, and the Top 70/Top 60/Final Selection brackets plus approval
progress against a real generated ranking).
