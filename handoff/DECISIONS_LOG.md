# Governance decisions log

Every place this build hit a genuine "programme rules are undefined /
would have to invent a business rule / multiple interpretations are
equally valid" situation, what was decided, who decided it, and where
the reasoning lives. Read this before re-deriving any of these — they've
already been settled.

## 1. Non-escalated review-score aggregation formula

**Question:** When a review isn't escalated to a third reviewer, what is
"the application's review score" — no document stated the formula.

**Decision:** `average(R1.totalScore, R2.totalScore)`, reasoned from
consistency with the already-documented escalated-case formula (which
itself ends in an averaging step).

**Status:** Implemented, but flagged for programme-owner confirmation —
not re-litigated, just not yet rubber-stamped by a human.

**Where:** `docs/adr/ADR-0015-review-score-aggregation-formula.md`,
`modules/scoring/services/scoreAggregationService.ts`.

## 2. Final cohort size — Top 30 vs Top 60/70

**Question:** `docs/database.md`'s `RankingTier` enum (`TOP_70`,
`TOP_60`, `RESERVE`, `NOT_RANKED`) and a documented `ranking.top60Size`
setting name implied a 60-person final cohort. The original overnight
brief's Module 5 said "Top 30 selection." Flagged as a real, blocking
conflict after Release 1 Module 1 shipped (which only needed the
consistent "Top 70" interview-shortlist number, so it wasn't blocking
yet).

**Decision:** Resolved by the Enterprise Functional Specification
Addendum itself, which arrived before Module 5 was built: **Application
Review (/60) + Interview (/40) = Final Score (/100)**, **Top 30**
confirmed by committee. On inspection, this was never actually a
conflict — "Top 70" was always the interview-shortlist size (how many
applicants get interviewed), a different number from "the final
cohort size" (how many get admitted). The review stage was already
seeded at max 60 points (a score *scale*, not a headcount) since Phase
3A. Nothing built in Modules 1–2 needs to change because of this.

**Status:** Resolved, no rework needed.

**Where:** `handoff/ENTERPRISE_FUNCTIONAL_SPECIFICATION_ADDENDUM.md`
Module 4 & Module 6; `docs/architecture.md`'s "Enterprise Functional
Specification Addendum" section.

## 3. Applicant interview-slot self-booking access

**Question:** The Addendum's Module 1 (§1.5) requires applicants to
view available slots, select one, and submit a booking request — which
needs *some* applicant-facing access. No applicant-facing authentication
exists anywhere in the codebase: `Applicant`/`Application` are plain
database rows with no login, `Role.FELLOW` is explicitly excluded from
`ASSIGNABLE_ROLES` in V1 (`lib/rbac/roles.ts`), and `docs/architecture.md`
documents "No module access until the Fellow Portal ships in V2" as a
settled Phase 0 decision. This is a direct conflict between a new
requirement and a standing architectural boundary — genuinely
undefined, multiple real implementations possible, expensive to guess
wrong on (a full new auth surface, if wrong).

**Escalated to the user** via `AskUserQuestion` with three options: (a)
a minimal token-based booking link — recommended, (b) build the full
Fellow Portal now, (c) no applicant-facing surface at all (Secretariat
books on the applicant's behalf).

**Decision (user, verbatim reasoning captured in ADR-0017):** Option
(a) — a secure, invitation-based, single-purpose booking page reachable
via a cryptographically random token embedded in a link, emailed to the
applicant. Not a portal: no login, no access to application details,
scores, other applicants, or anything beyond booking this one interview.
Explicitly **not** the Fellow Portal — that V2 decision stands unchanged.

**Status:** Implemented and shipped in the Interview Scheduling module
(`36fef5a`).

**Where:**
`docs/adr/ADR-0017-interview-booking-token-access.md` (full reasoning
and alternatives considered), `docs/INTERVIEW_SCHEDULING.md`,
`app/(auth)/interview/book/[token]/`.

## 4. No email / job-scheduler infrastructure (a pre-existing boundary, reaffirmed)

**Not a new decision** — Release 1.5 already established this
explicitly ("no delivery mechanism exists in this codebase yet,"
`lib/settings/registry.ts`'s Notification Configuration category
comment). Restated here because the Addendum's Modules 1, 8, and 9 all
assume real invitations/reminders exist, and every subsequent module
built against the Addendum needs to keep respecting this boundary
rather than re-deciding it per module:

- Interview invitations/reminders (Addendum §1.8/§1.9): recorded
  (`Interview.invitationsSentAt`, audit log), never dispatched.
- Offer reminders (Addendum Module 8, day 3/6/7): will need the same
  treatment when Offer Management is built (task #99) — do not invent
  an email provider integration; record and audit only, exactly like
  `schedulingService.sendDueReminders`.
- If a real deployment ever needs actual delivery, that's a distinct,
  larger infrastructure decision (which provider, which queue/cron) that
  no specification received so far actually makes — don't guess at it
  inside a feature module.

**Where:** `docs/INTERVIEW_SCHEDULING.md`'s "Known limitation" section
is the fullest writeup; the same reasoning applies verbatim to Offer
Management (task #99) and the reminder pieces of Module 9's audit sweep
(task #100).

## How to add to this log

When a future module (see `handoff/REMAINING_WORK.md`) hits a genuine
governance question — not a design preference, a real "the spec doesn't
say and getting it wrong is expensive" situation — resolve it the same
way these were: escalate to the user with `AskUserQuestion` if it's
blocking, write an ADR either way, and add an entry here so the next
session doesn't re-ask a question that's already been answered.
