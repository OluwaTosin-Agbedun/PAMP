# Analytics

FMS Development Planning Instruction, Planning Phase 5 (§7.1–§7.8 of the
original instruction). An operational Analytics Dashboard for the
Programme Secretariat and authorised administrators — six metric
categories, filters, and a CSV export, all computed live from data
every prior module already writes.

## No new persistent tables

Every metric is compute-on-read against existing tables — the same
convention this codebase already uses for the home Dashboard's summary
counts and `getReviewOperationsDashboard`. No `AnalyticsSnapshot` or
cache table exists; there is nothing to refresh or go stale.
`modules/analytics/{domain,repositories,services,validation}`.

## The six categories (`modules/analytics/repositories/analyticsRepository.ts`)

- **§7.1 Application Analytics** — totals, eligibility breakdown,
  missing-document count (a `FAIL` in the `DOCUMENT` checklist section),
  clarification cases, duplicate flags (`duplicateOfId IS NOT NULL`),
  integrity flags (a `FLAG` in the `INTEGRITY` checklist section),
  submission trend by day, pathway/state/gender distribution.
- **§7.2 Review Analytics** — reviewers assigned, unassigned
  applications, review status breakdown, average completion time,
  score average/variance, third-review triggers, reviewer conflicts,
  shortlist/reserve/not-shortlisted totals.
- **§7.3 Interview Analytics** — shortlisted count, interview status
  breakdown, attendance breakdown (rescheduled/absent/technical issue
  all come from `Interview.attendanceStatus`, Interview Module
  Completion Phase 2), panel-assignment and score-submission completion
  percentages, average interview score, decision-band breakdown,
  invitations/reminders sent.
- **§7.4 Final Ranking Analytics** — final-score distribution (the same
  85/75/65 thresholds `modules/ranking/domain/ranking.ts`'s
  `decisionBandFor` already uses), Top 70/Top 60/Final 30 counts (the
  Executive Approval workflow's own fixed brackets, Planning Phase 3/4),
  ties, tie-break decisions, ranking versions, approved-vs-provisional.
- **§7.5 Admission and Offer Analytics** — see "Known gap" below.
- **§7.6 Notification Analytics** — generated/sent/failed counts, retry
  success rate, delivery by event type, reminder-delivery completion,
  applicants without a valid email (a plain regex check over
  `Applicant.email`, computed here rather than stored).

## Known gap: Admission and Offer Analytics is honestly empty

The Admissions/Offers module itself was never built this session
(explicitly out of scope for this planning instruction's five modules)
— `AdmissionOffer` is a dormant, unconsumed scaffold with zero writers
anywhere in the codebase (confirmed by search, the same finding as
`ExecutiveApproval` in
[docs/EXECUTIVE_APPROVAL.md](EXECUTIVE_APPROVAL.md)). This category's
query is real and correct; it will honestly return all-zero counts
until that module exists, which is the truth, not a bug — the dashboard
says so directly rather than hiding the gap.

## Known gap: no `sector` field

§7.1 and §7.7 both ask for a sector breakdown/filter. No `sector` value
exists anywhere in the data model (confirmed by search) — not a column,
not a convention inside the free-form imported `essayAnswers`/
`rawImportRow` JSON. `sectorDistribution` is reported as `null`
("Not available") rather than invented, and no `sector` filter exists.

## Region, derived not stored

§7.1's "regional distribution" and §7.7's "Region" filter both work
against Nigeria's six geopolitical zones, derived from
`Applicant.stateOfOrigin` via a static lookup
(`modules/analytics/domain/analytics.ts`'s `NIGERIA_STATE_TO_ZONE`) —
no new schema field, since the mapping is fixed, well-known data, not a
business rule this module invents. `statesInZone` is the exact inverse,
used to turn a zone filter into a `stateOfOrigin IN (...)` clause.

## Filters (§7.7)

`Cohort` is implicit (the active cohort, like every other workspace in
this codebase). Every other filter —
date range, stage, eligibility status, pathway, state, zone, gender,
reviewer, interview panellist — narrows every category's query via
`buildApplicationWhere` (application-scoped categories) or a
category-specific `where` extension (reviewer only affects Review
Analytics, panellist only Interview Analytics). `reviewerId`/
`panellistId` filter *workload counts* only — never a route to that
person's individual scores or comments, which stay behind
`REVIEW_SCORES_VIEW`/`INTERVIEW_SCORES_VIEW_ALL` exactly as everywhere
else in this codebase (`docs/BLIND_REVIEW.md`'s discipline applies
here too). The reviewer/panellist picker lists are scoped to people
who actually have activity in the cohort, not every account holding
that role.

`reports.default_date_range_days` (Configuration Centre, default 90)
resolves the date-range default when a caller doesn't specify one —
resolved in the service layer (`analyticsService.ts`'s
`resolveDateFrom`), not the page component, since a Server Component's
render must stay pure (no `Date.now()` inside JSX-returning code —
`react-hooks/purity`).

## Reporting / export (§7.8)

`exportAnalyticsCsv`, gated on `REPORTS_EXPORT`, produces a CSV with the
required report header (report name, generated date/time, generating
user, cohort, applied filters) followed by every category's figures —
the same BOM-prefixed CSV convention `exportRankingCsv`/
`exportReviewOperationsCsv` already use. PDF is explicitly conditional
in the source instruction on "where the repository already supports
safe PDF generation" — it doesn't, so PDF isn't built here rather than
adding a new rendering dependency for one feature. Every export is
audited (`REPORTS_EXPORTED`).

## Permissions

`REPORTS_VIEW`/`REPORTS_EXPORT` already existed in the catalogue
(placeholder "[base]" permissions, previously granted only to
`PROGRAMME_DIRECTOR`/`SYSTEM_ADMIN` via `PROGRAMME_OVERSIGHT`, checked
nowhere) — this phase is their first real consumer. Also granted to
`PROGRAMME_SECRETARY`, matching the instruction's own stated audience
("Programme Secretariat and authorised administrators").

## Feature flag

`feature.analytics` gates `/reports` (`layout.tsx`,
`notFound()`-the-whole-subtree — the same pattern
`feature.executive_dashboard` established) and defaults **off**: this
route never existed before this phase, so there's no "preserve existing
behaviour" to protect (see [docs/FEATURE_FLAGS.md](FEATURE_FLAGS.md)).

## Configuration Centre

A new "Reports Configuration" category holds the one setting that's
genuinely real and consumed:
`reports.default_date_range_days`. The other Analytics Configuration
items the source instruction lists — "Enabled roles" (RBAC already
covers this), "Refresh frequency" (there is none; compute-on-read is
always live), "Available reports" (a fixed set of six categories, not
admin-configurable), "Export permissions" (already `REPORTS_EXPORT`) —
don't map to a real, independently-actionable setting, so no decorative
toggle was added for them.

## Audit

`REPORTS_EXPORTED` — `entityType: "Cohort"`, metadata carries the
applied filters. Viewing the dashboard itself is not audited, matching
this codebase's existing convention of auditing mutations and exports,
not reads (the planning instruction's own "optional, not default
elsewhere" note on view-level audit, already established in
[docs/EXECUTIVE_APPROVAL.md](EXECUTIVE_APPROVAL.md)).

## Testing

`tests/unit/analytics.test.ts` covers the pure domain functions in
isolation (`zoneForState`/`statesInZone`'s exact-inverse relationship,
case-insensitivity, unrecognised-value handling; `toCountRecord`'s
null-bucketing; `percentage`'s zero-denominator and rounding behaviour;
`dateRangeDays`'s inclusive range).
`tests/integration/analytics.test.ts` covers the service against real
Postgres data — matching the "Analytics Tests" checklist directly:
accurate aggregation (known counts, eligibility breakdown, duplicates,
zone distribution), filter combinations (eligibility status + zone),
empty data (a cohort with zero applications, no errors), a moderate
data volume (40 applications), role restrictions (view and export
denial), export permissions (a real CSV with every required report
metadata field and an audit row), and date-range filtering (including
that a far-future `dateFrom` correctly excludes everything, proving the
filter is live, not decorative).
