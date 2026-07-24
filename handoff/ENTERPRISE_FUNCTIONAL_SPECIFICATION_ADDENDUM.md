# PAM-P Fellowship Management System — Release 1.0

## Interview Engine, Final Ranking & Admissions

### Enterprise Functional Specification (Implementation Addendum)

> Verbatim capture of the specification message received mid-session
> (2026-07-19), after Release 1 Modules 1–2 (old brief) and before
> Interview Scheduling was built. This document is not reproduced
> anywhere else in the repository except through this file — treat it as
> the authoritative source text. See `handoff/README.md` for how it
> relates to what's already built and `handoff/REMAINING_WORK.md` for
> the module-by-module backlog derived from it.

---

## Context

You are continuing development of the PAM-P Fellowship Management System.

The existing architecture, coding standards, ADRs, Prisma schema, RBAC model, audit framework, testing strategy and Reviewer Workspace patterns must remain unchanged.

This document supersedes any previous assumptions regarding Interview Scheduling, Interview Scoring, Final Ranking and Admissions.

Implement the following business rules exactly.

Do not invent workflows or simplify governance.

## MODULE 1 — INTERVIEW SCHEDULING

### 1.1 Interview Configuration

Programme Secretariat shall configure:

- Interview period
- Interview dates
- Daily schedule
- Interview duration
- Buffer duration
- Maximum interviews per day

### 1.2 Panel Availability

Interview Panelists shall submit:

- Available dates
- Available time windows
- Temporary unavailability
- Leave periods

Every modification shall be audited.

### 1.3 Interview Slot Generation

The scheduling engine shall generate interview slots only where all assigned panelists are simultaneously available.

Configuration:

- Interview Duration = 30 minutes
- Mandatory Buffer = 5 minutes
- Scheduling Block = 35 minutes

The scheduling engine shall prevent overlapping interviews.

### 1.4 Daily Capacity

Maximum confirmed interviews: 4 applicants per day

The scheduling engine shall:

- Prevent overbooking
- Mark full interview days
- Display remaining capacity
- Prevent accidental Secretariat overrides

### 1.5 Applicant Booking

Programme Secretariat publishes available interview slots.

Applicants may:

- View available slots
- Select one preferred slot
- Submit booking request

Applicants may never hold multiple interview bookings.

### 1.6 Secretariat Confirmation

Applicant booking does not confirm the interview.

Programme Secretariat must:

- Confirm
- Decline
- Request another slot

Only confirmed interviews become official.

### 1.7 Microsoft Teams Link

Immediately after confirmation:

The system shall prompt: **Paste Microsoft Teams Meeting Link**

Requirements:

- Mandatory before invitations can be sent.
- Secretariat pastes externally generated Teams link.
- Validate URL.
- Store securely.

Version 1 shall not implement Microsoft Graph integration.

### 1.8 Interview Invitations

After Teams link entry:

System sends invitations to:

- Applicant
- Four Interview Panelists
- Programme Secretariat

Invitation includes:

- Applicant Name
- Application ID
- Leadership Pathway
- Interview Date
- Interview Time
- Microsoft Teams Link
- Joining Instructions

### 1.9 Automatic Reminders

Applicants:

- 24 hours before interview
- 1 hour before interview

Panelists:

- 24 hours before interview
- 1 hour before interview

Reminder intervals shall be configurable.

## MODULE 2 — INTERVIEW SCORING

### 2.1 Interview Panel

Each interview consists of: **4 Panelists**

### 2.2 Independent Scoring

All four panelists interview the applicant together.

Each panelist:

- Completes an independent electronic score sheet
- Cannot view another panelist's scores
- Cannot view another panelist's comments
- May save draft scores
- May submit independently

After submission:

- Score becomes locked
- Panelist may only view their own submission

### 2.3 Interview Comments

Each panelist records:

- Overall assessment
- Strengths
- Concerns
- Recommendation

Comments become read-only after submission.

### 2.4 Visibility Rules

**Interview Panelists**

Can view:

- Their own score
- Their own comments

Cannot view:

- Other panelists' scores
- Other panelists' comments

After all required submissions:

Can additionally view:

- Final averaged interview score only

**Programme Secretariat**

Can view:

- All interview scores
- All comments
- Final average

**Final Selection Committee**

Can view:

- All interview scores
- All interview comments
- Final average

**Executive Approval Panel**

Can view:

- All interview scores
- All interview comments
- Final average

**Applicants**

Cannot view interview scores or comments.

### 2.5 Minimum Submission Rule

Normal operation: 4 panelists submit

Minimum valid threshold: 3 submissions

If: 3 or 4 panelists submit → Interview proceeds.

If: fewer than 3 submit → Interview remains incomplete.

### 2.6 Secretariat Override

Where one panelist fails to submit:

Programme Secretariat may invoke: **Close Interview with Three Valid Scores**

System shall require:

- Mandatory reason
- Automatic recording of missing panelist
- Audit entry

Final Interview Score: Average of the valid submitted scores only.

No averaging is permitted using fewer than three submissions.

### 2.7 Interview Score Calculation

System calculates:

```
Average Interview Score
=
Sum of valid interview totals
÷
Number of valid submissions
```

No manual editing of averages.

## MODULE 3 — INTERVIEW QUESTIONS

The interview shall use a hybrid questioning model.

**Mandatory Questions**

Every applicant answers the same mandatory questions.

Mandatory questions cannot be skipped.

**Pathway Questions**

System automatically displays pathway-specific questions.

Supported pathways:

- Entrepreneurship & Enterprise
- Public & Private Sector Leadership
- Academia & Advanced Studies

**Additional Questions**

Panelists may choose additional questions only from the approved question bank.

Panelists may not create ad hoc questions.

System records:

- Every question asked
- Panelist selecting additional question
- Interview start time
- Interview end time

## MODULE 4 — FINAL RANKING

System calculates:

```
Application Review (/60)
+
Interview (/40)
=
Final Score (/100)
```

The platform shall:

- Calculate automatically
- Prevent manual editing
- Rank highest to lowest
- Audit every recalculation

## MODULE 5 — TIE BREAKING

**Tie Level 1**

Higher Interview Score wins.

**Tie Level 2**

If still tied: Higher Application Review Score wins.

**Tie Level 3**

If still tied: Final Selection Committee reviews:

- Interview comments
- Review comments
- Leadership pathway suitability
- Cohort balance

Committee records mandatory justification.

## MODULE 6 — FINAL SELECTION COMMITTEE

Committee SHALL NOT:

- Modify review scores
- Modify interview scores
- Recalculate applicant scores

Scores are final.

Committee SHALL:

- Confirm Top 30 Fellows
- Confirm Reserve List
- Resolve unresolved ties
- Ensure pathway balance
- Ensure cohort diversity
- Record cohort balancing reasons

Where Committee departs from the strict ranking:

System requires:

- Mandatory justification
- Committee member
- Timestamp
- Full audit trail

Platform preserves:

- Original System Ranking
- Final Approved Cohort

## MODULE 7 — RESERVE LIST

Committee approves: Ranked Reserve List.

Reserve list size shall be configurable.

Where a selected Fellow:

- Declines
- Withdraws
- Fails to accept
- Becomes ineligible

System recommends the next highest-ranked reserve.

System prevents reserves from being skipped without recorded justification.

## MODULE 8 — OFFER MANAGEMENT

Offer validity: **7 calendar days**

Countdown begins immediately after offer issuance.

Automatic reminders:

- Day 3
- Day 6
- Day 7 (Expiry)

If applicant fails to respond:

- Offer expires automatically.
- Programme Secretariat notified.
- Next reserve becomes eligible.

## MODULE 9 — AUDIT

Audit every event including:

**Scheduling**

- Availability submitted
- Availability updated
- Slot generated
- Slot booked
- Slot confirmed
- Teams link added
- Invitation sent
- Reminder sent

**Interview**

- Draft created
- Draft saved
- Submission
- Missing panelist
- Secretariat override
- Average calculated

**Ranking**

- Final ranking generated
- Tie resolved
- Committee decision
- Cohort balancing

**Admissions**

- Offer issued
- Reminder sent
- Offer accepted
- Offer declined
- Offer expired
- Reserve promoted

## IMPLEMENTATION REQUIREMENTS

Reuse existing Reviewer Workspace architecture wherever appropriate, including:

- Server Component pattern
- Thin Server Actions
- Service-layer authorization
- Repository scoping
- Decimal serialization strategy (ADR-0010)
- Draft autosave behaviour
- Typed AppErrors
- Audit framework
- Accessibility standards
- Existing testing conventions

Do not duplicate Review Workspace code unnecessarily. Extract shared components and utilities where appropriate while respecting the current architecture.

## ACCEPTANCE CRITERIA

This implementation is complete only when:

- Interview scheduling functions end-to-end.
- Applicants self-book interview slots.
- Secretariat confirms bookings.
- Teams links are required before invitations.
- Automatic reminders function correctly.
- Independent interview scoring is enforced.
- A minimum of three valid submissions is required.
- Secretariat override functions correctly with mandatory justification.
- Interview averages are calculated automatically.
- Final scores (/100) are calculated automatically.
- Tie-breaking rules are fully implemented.
- Final Selection Committee permissions and restrictions are enforced.
- Reserve list workflow is operational.
- Seven-day offer management is operational.
- Every workflow is fully audited.
- Existing architecture, RBAC, coding standards, ADRs, documentation and tests remain intact.

## Final Instruction

Implement these requirements incrementally, preserving architectural quality and production readiness. Do not introduce assumptions where the specification is explicit. If an implementation conflict arises between this specification and an earlier design assumption, this specification takes precedence. After implementation, update the architecture documentation, ADRs (where applicable), and regression tests to reflect the completed functionality.
