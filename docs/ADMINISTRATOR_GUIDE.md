# Administrator Guide — Release 1.5

A role-oriented map of everything Release 1.5 added, for System
Administrator, Programme Director, and Programme Secretary/Admin
accounts. For step-by-step screen instructions, see the linked guides;
this page is the "what exists and who can touch it" overview.

## Configuration Centre

`/administration/configuration` — Director, Secretary/Admin, System
Admin. Seven categories (Programme, Review, Interview, Scoring,
Notification, File Upload, Security) covering every admin-tunable
operational value this codebase has. See
`docs/CONFIGURATION_CENTRE_GUIDE.md` and
`docs/CONFIGURATION_REFERENCE.md` for the full setting-by-setting
reference.

## Feature Flags

`/administration/feature-flags` — **System Administrator only**. Six
platform-level switches; only one (Exports) currently gates a real,
already-built feature. See `docs/FEATURE_FLAGS.md`.

## Eligibility QA

An Eligibility Reviewer flags a questionable automated eligibility
outcome from the Applicant Detail page; a Programme Secretary sees
pending flags at `/eligibility-recommendations` and executes or
dismisses each one from that same applicant page. Neither role can
change `Application.eligibilityStatus` any other way. See
`docs/ELIGIBILITY_QA_GOVERNANCE.md`.

## Risk Dashboard

`/review-operations/risk` — the same access as the rest of the
Secretariat Review Operations Workspace (Director/Secretary/Admin).
Ten operational risk signals (approaching deadline, stalled, awaiting
reassignment, overloaded reviewers, third-review rate, conflict
declarations, pending escalations, review backlog, average completion
time, applications requiring attention), aggregated from data the rest
of the workspace already shows individually — no new business logic.

## Audit Trail

Every mutation across the whole system — including every one listed
above — now carries a Correlation ID, Request ID, Session ID, IP
Address, and User Agent alongside the actor and timestamp Phase 2
already recorded, without any change to how modules call
`writeAuditLog`. There is still no dedicated Audit Trail viewer screen
in this codebase (`lib/navigation.ts`'s "Audit Trail" nav item remains
`implemented: false`, a pre-existing gap from before this phase) — audit
rows are queryable directly against `AuditLog` today, not yet through a
UI.

## Quick reference: who can do what

| Capability | System Admin | Programme Director | Programme Secretary/Admin | Eligibility Reviewer |
|---|---|---|---|---|
| View/change Configuration Centre | Yes | Yes | Yes | No |
| Manage Feature Flags | Yes | No | No | No |
| Flag an eligibility case | Yes (has every permission) | No | No | Yes |
| Execute/dismiss an eligibility override | Yes | No | Yes | No |
| View Risk Dashboard | Yes | Yes | Yes | No |

## What's explicitly not here

Per the brief's scope restrictions, this release does not include:
Interview Engine, Interview Scheduling, Notification Engine, Executive
Approval, Offer Management, or AI features. Configuration for several of
these (Interview Configuration, the four future date windows, the
Interview Module and Notifications feature flags) is already in place
and stored — see `docs/PHASE_RELEASE_1_5_IMPLEMENTATION_REPORT.md`'s
readiness assessment for what each future phase can build directly on
top of.
