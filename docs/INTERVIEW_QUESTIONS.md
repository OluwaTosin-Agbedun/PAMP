# Interview Questions

Enterprise Functional Specification Addendum, Module 3. Gives `InterviewQuestion`
(declared since Phase 1, unused until now) its first writers: a Director/Admin-managed
question bank, and a per-interview session that records mandatory/pathway questions
automatically and lets panellists pick additional ones from the bank. See
[ADR-0019](adr/ADR-0019-interview-questions.md) for the full reasoning, including why
this is free-standing from the (unchanged) `InterviewCriterion` scoring rubric Module 2
built.

## Schema

Two migrations:

`prisma/migrations/20260721090000_addendum_module3_interview_questions`:

- `InterviewQuestion` gains `category` (originally `MANDATORY | PATHWAY | ADDITIONAL_BANK`,
  new enum, required — see below for the Interview Configuration addition) and `pathway`
  (`InterviewPathway?`, new enum: `ENTREPRENEURSHIP_ENTERPRISE`,
  `PUBLIC_PRIVATE_SECTOR_LEADERSHIP`, `ACADEMIA_ADVANCED_STUDIES` — set only when
  `category = PATHWAY`).
- New `InterviewQuestionAsked` — one row per question actually asked in an interview
  (`@@unique([interviewId, questionId])`), with `askedByPanelistId`/`askedAt`.
- `Interview` gains `actualStartedAt`/`actualStartedById` and
  `actualEndedAt`/`actualEndedById` — the real observed session boundaries, distinct
  from `scheduledAt` (the planned time).

`prisma/migrations/20260722200000_interview_module_completion` (Interview Configuration
document, Planning Phase 2):

- `InterviewQuestionCategory` gains a fourth value, `SITUATIONAL`, inserted between
  `PATHWAY` and `ADDITIONAL_BANK` — a pathway-independent question bank, same
  auto-asked treatment as `PATHWAY` but not filtered by `Application.pathway`.
- `Interview` gains `attendanceStatus` (`InterviewAttendanceStatus`, default
  `SCHEDULED`), `attendanceRecordedAt`/`attendanceRecordedById`, and `attendanceNote` —
  see "Attendance" below.

No delete endpoint exists for `InterviewQuestion` — `isActive` is the only
lifecycle-ending state (matches `EligibilityCriterion`'s convention). Once a question
has ≥1 `InterviewQuestionAsked` row, its `text`/`category`/`pathway` become immutable at
the service layer; `isActive`/`order` stay editable.

## Question bank

`modules/interviews/services/interviewQuestionService.ts`: `listQuestionsForCohort`,
`createQuestion`, `updateQuestion` (rejects the historical-integrity lock with
`ConflictError`), `setQuestionActive` — all gated on `interview_questions.manage`
(Director + Admin, same `PROGRAMME_OVERSIGHT` placement as
`ELIGIBILITY_MANAGE_CRITERIA`). UI at `/interviews/questions` (inside the existing
"Interview Management" nav group — the platform's 12-item taxonomy is closed, so this is
a second item in an existing group, not a new one), modeled on
`eligibility-criteria`'s table/Dialog/toggle shape but calling through the
service/repository layers rather than Prisma directly.

## Interview session

Same service, gated on `interview_session.manage` (`Role.INTERVIEWER`):

- `startInterviewSession` — status-conditioned (`actualStartedAt` must still be null),
  and in the same transaction auto-records every active mandatory question, plus a
  **random 2** of the active pathway questions matching the application's pathway and a
  **random 1** of the active situational questions
  (`modules/interviews/domain/interviewQuestions.ts`'s `selectAutoAskedQuestions`) as
  asked. One audit entry (`INTERVIEW_SESSION_STARTED`) covers the whole bulk-record —
  not one per question.

  The random pick is seeded by `interviewId` (`seededRandom`, a small deterministic
  PRNG), not `Math.random()` — `selectAutoAskedQuestions` is also called from the
  read-only pre-session preview (`getQuestionFrameworkForInterview`), which a panellist
  may load many times before starting. Seeding by `interviewId` guarantees the preview
  always shows exactly what will actually get recorded, regardless of how many times it's
  viewed.
- `selectAdditionalQuestion` — requires the session started and not yet ended, the
  question must be an active `ADDITIONAL_BANK` question, rejects a duplicate pick
  (`@@unique([interviewId, questionId])`, caught as `P2002` and translated to a friendly
  `ConflictError`), and — per the Interview Configuration document — caps each panellist
  at **one** follow-up question per interview (`ConflictError` on a second attempt;
  `interviewQuestionRepository.countAdditionalQuestionsAskedByPanelist` counts only
  `ADDITIONAL_BANK` picks attributed to that panellist, so it doesn't double-count the
  auto-recorded mandatory/pathway/situational questions). Each selection is its own
  audited event (`INTERVIEW_ADDITIONAL_QUESTION_SELECTED`) — a discretionary human
  choice, unlike the deterministic auto-record above.
- `endInterviewSession` — requires the session started and not already ended; after
  this, the asked-question list is locked.

No `InterviewPanelist.isChair` restriction — any active panellist can start/end the
session or select a question, self-attributed. All three actions use the same
status-conditioned `updateMany` + `ReviewConcurrencyError` pattern every other
concurrency guard in this codebase uses.

## Attendance

`recordAttendance` (`modules/interviews/services/schedulingService.ts`), gated on
`interview_scheduling.manage` (the Secretariat's own permission, not a panellist one) —
records one of `PRESENT | LATE | ABSENT | TECHNICAL_ISSUE | RESCHEDULED | CANCELLED`
against a booked interview, plus an optional free-text note, and audits who recorded it
and when (`INTERVIEW_ATTENDANCE_RECORDED`). Surfaced on the scheduling detail page
(`/interviews/scheduling/[interviewId]`) once a booking is `CONFIRMED`. This is a
Secretariat operational record, independent of the question/session mechanics above.

## Visibility

- **A panellist** (`getInterviewWorkspaceView`, extended): the auto-asked list, the
  active bank questions not yet asked, and everything already asked in this interview —
  shown as reference context on the same scoring workspace page Module 2 built
  (`app/(dashboard)/interviews/[interviewId]/`), via a new `InterviewQuestionsPanel`.
- **Programme Secretariat / Selection Committee / Executive**
  (`getInterviewScoreOverviewForSecretariat`, extended): the full asked-question list
  with selector attribution and timestamps, on the existing oversight page
  (`app/(dashboard)/interviews/scoring-oversight/[interviewId]/`).

## Routes

| Route | Purpose |
|---|---|
| `/interviews/questions` | New. Director/Admin question bank management. Gated on `interview_questions.manage`. |
| `/interviews/[interviewId]` | Unchanged route; gained the "Interview questions" panel (start/end session, mandatory/pathway list, additional-question picker) above the (renamed-copy) scoring criteria section. |
| `/interviews/scoring-oversight/[interviewId]` | Unchanged route; gained a read-only "Questions asked" card. |

## Testing

`tests/unit/interviewQuestions.test.ts` covers the pure pathway-matching and
auto-asked-question-selection logic, including the random-2-pathway/random-1-situational
picks and `seededRandom`'s determinism. `tests/integration/interviewQuestions.test.ts`
covers bank CRUD and permission denial, the historical-integrity lock, session
start/end (including rejecting a non-panellist and a double start/end), additional-
question selection (including the started/ended/duplicate/wrong-category/one-per-panellist
rejections), and oversight visibility. `tests/integration/interviewScheduling.test.ts`
covers `recordAttendance`'s permission check and audit trail.

## Known limitation

`Application.pathway` remains free text (Excel/CSV import, unconstrained) — an
applicant whose imported pathway string doesn't exactly match one of the three
canonical labels (after trim/case-insensitive comparison) simply sees no pathway
questions. This is a pre-existing data-quality characteristic of the import pipeline,
not something this module changes.
