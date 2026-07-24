# Configuration Reference

Every setting `lib/settings/registry.ts`'s `SETTINGS_REGISTRY` declares
— generated from that file, not hand-maintained separately, so it can
never drift from the actual code. "Editable" means the Configuration
Centre lets an administrator change it; "Read-only" settings are shown
for transparency but are structural facts about this codebase, not
tunable values (see each one's own description for why).

**Consumer status** (not shown in the tables below — see
`docs/CONFIGURATION_CENTRE_GUIDE.md` and each category's brief note):
most Review and Security settings are consumed by real code today;
every Interview and Notification setting, and most File Upload
settings, are stored with **no consumer yet** — the corresponding engine
doesn't exist in this codebase (Interview Engine, Notification
delivery, document upload) — per the brief's own "configuration only,
no functionality" instruction for those categories.

## Eligibility Configuration

| Key | Label | Type | Default | Range/Options | Editable |
|---|---|---|---|---|---|
| `eligibility.clarification_deadline_hours` | Clarification response window (hours) | number | 24 | 1–720 | Yes |

Consumed by `modules/eligibility/screeningService.ts`'s
`requestClarification`/`runAutomaticEligibilityDecision` (sets the
deadline) and `checkMissedClarificationDeadlines` (enforces it) — see
docs/ELIGIBILITY_SCREENING.md's "Clarification deadline" section.

## Review Configuration

| Key | Label | Type | Default | Range/Options | Editable |
|---|---|---|---|---|---|
| `review.reviewers_per_application` | Number of reviewers | number | 2 | — | Read-only |
| `review.third_review_divergence_threshold_percent` | Third review threshold | number | 20 | 0–100 | Yes |
| `review.blind_review_enabled` | Blind review | boolean | true | — | Read-only |
| `review.reviewer_default_max_concurrent_assignments` | Maximum reviewer workload | number | 10 | 1–100 | Yes |
| `review.reassignment_rules_summary` | Reviewer reassignment rules | string | (see below) | — | Read-only |
| `review.automatic_assignment_enabled` | Automatic assignment | boolean | true | — | Yes |
| `review.completion_deadline_summary` | Review completion deadline | string | (see below) | — | Read-only |
| `review.reminder_frequency_days` | Review reminder frequency (days) | number | 3 | 1–30 | Yes |

`reassignment_rules_summary` points to `docs/REVIEW_REASSIGNMENT.md`;
`completion_deadline_summary` points to the Programme Configuration
screen's Application Review Window (a real `ReviewStage` field, not a
generic setting).

## Interview Configuration

Every key below is stored with zero consumer — the Interview Engine
isn't built this phase.

| Key | Label | Type | Default | Range/Options | Editable |
|---|---|---|---|---|---|
| `interview.panellist_count` | Number of interview panellists | number | 3 | 1–10 | Yes |
| `interview.duration_minutes` | Interview duration (minutes) | number | 30 | 10–180 | Yes |
| `interview.passing_score` | Passing score | number | 70 | 0–100 | Yes |
| `interview.weighting_percent` | Interview weighting (%) | number | 30 | 0–100 | Yes |
| `interview.tie_break_rule` | Tie-break rule | string | `CHAIR_DECIDES` | `CHAIR_DECIDES`, `RE_VOTE` | Yes |
| `interview.reserve_list_size` | Reserve list size | number | 10 | 0–100 | Yes |
| `interview.scheduling_window_days` | Interview scheduling window (days) | number | 14 | 1–90 | Yes |

## Scoring Configuration

| Key | Label | Type | Default | Range/Options | Editable |
|---|---|---|---|---|---|
| `scoring.total_score` | Total score | number | 100 | — | Read-only |
| `scoring.stage_weightings_summary` | Stage weightings | string | (see below) | — | Read-only |
| `scoring.passing_threshold` | Passing threshold | number | 60 | 0–100 | Yes — no consumer yet |
| `scoring.ranking_method` | Ranking method | string | `WEIGHTED_SUM` | — | Read-only |
| `scoring.third_review_calculation_strategy` | Third-review calculation strategy | string | `LOWER_OF_FIRST_TWO_PLUS_THIRD_AVERAGED` | — | Read-only |
| `scoring.minimum_qualifying_score` | Minimum qualifying score | number | 50 | 0–100 | Yes — no consumer yet |

`total_score` is informational — the real total is per-framework
(`ReviewFramework.totalConfiguredScore`). `stage_weightings_summary`
reflects that V1.0 runs one scored stage. `ranking_method` and
`third_review_calculation_strategy` each have exactly one implemented
strategy — there's no second one to choose between yet, so they're
shown, not made falsely pluggable.

## Notification Configuration

Every key below is stored with zero consumer — no delivery mechanism
exists anywhere in this codebase yet.

| Key | Label | Type | Default | Range/Options | Editable |
|---|---|---|---|---|---|
| `notification.enabled` | Notifications enabled | boolean | false | — | Yes |
| `notification.reminder_interval_days` | Reminder interval (days) | number | 3 | 1–30 | Yes |
| `notification.timing` | Notification send time | string | `09:00` | — | Yes |
| `notification.sender_name` | Email sender name | string | `PAM-P Fellowship Programme` | — | Yes |
| `notification.reply_address` | Email reply address | string | `noreply@pam-p.org` | — | Yes |
| `notification.escalation_timing_days` | Escalation timing (days) | number | 2 | 1–30 | Yes |

## File Upload Configuration

| Key | Label | Type | Default | Range/Options | Editable |
|---|---|---|---|---|---|
| `file_upload.max_size_mb` | Maximum upload size (MB) | number | 10 | 1–200 | Yes — enforced on applicant import |
| `file_upload.allowed_file_types` | Allowed file types | string | `.xlsx,.xls,.csv` | — | Yes — enforced on applicant import |
| `file_upload.max_documents` | Maximum documents per application | number | 5 | 1–50 | Yes — no consumer yet |
| `file_upload.virus_scan_required` | Require virus scan | boolean | false | — | Yes — no consumer yet |
| `file_upload.image_compression_enabled` | Image compression | boolean | false | — | Yes — no consumer yet |
| `file_upload.document_retention_days` | Document retention (days) | number | 365 | 30–3650 | Yes — no consumer yet |

Only `max_size_mb` and `allowed_file_types` have a real consumer today
(`app/(dashboard)/applicants/import/actions.ts`) — the rest govern a
document-upload feature (`ApplicationDocument`) that has schema but no
implementation anywhere in this codebase.

## Security Configuration

| Key | Label | Type | Default | Range/Options | Editable |
|---|---|---|---|---|---|
| `security.session_timeout_minutes` | Session timeout (minutes) | number | 43200 | 5–129600 | Yes — see note below |
| `security.password_min_length` | Minimum password length | number | 10 | 8–128 | Yes — enforced live |
| `security.password_require_uppercase` | Require an uppercase letter | boolean | true | — | Yes — enforced live |
| `security.password_require_lowercase` | Require a lowercase letter | boolean | true | — | Yes — enforced live |
| `security.password_require_number` | Require a number | boolean | true | — | Yes — enforced live |
| `security.password_require_special` | Require a special character | boolean | true | — | Yes — enforced live |
| `security.failed_login_threshold` | Failed login threshold | number | 5 | 1–20 | Yes — see note below |
| `security.account_lock_duration_minutes` | Account lock duration (minutes) | number | 30 | 1–10080 | Yes — see note below |
| `security.mfa_required` | Require MFA | boolean | false | — | Yes — future flag |
| `security.audit_retention_days` | Audit retention (days) | number | 730 | 30–36500 | Yes — no purge job yet |

**Notes on partial enforcement** (documented, not hidden):
- `session_timeout_minutes` — Auth.js's JWT session config loads once at
  process start; changing this value takes effect on the next
  application restart/deploy, not live.
- `failed_login_threshold`/`account_lock_duration_minutes` — stored, not
  yet automatically enforced. This codebase logs every failed login
  (`USER_LOGIN_FAILED`) but has never counted attempts or auto-locked an
  account; `AccountStatus.LOCKED` remains administrator-set only. See
  `docs/AUTHENTICATION.md`.
- `mfa_required` — no MFA implementation exists in this codebase; named
  "(future flag)" in the brief itself.

## Feature Flags

Stored the same way, `category: "feature"` — see
`docs/FEATURE_FLAGS.md` for the full list and how `feature.exports` is
the one flag with a real feature to gate.

## Programme Configuration

Not part of `SETTINGS_REGISTRY` — structured fields on real tables, not
generic key/value settings:

| Field | Home | Notes |
|---|---|---|
| Programme name, code | `Programme.name`, `Programme.code` | `code` is new this phase, nullable, unconstrained. |
| Cohort name, year | `Cohort.name`, `Cohort.year` | |
| Application opening/closing date | `Cohort.applicationOpensAt`/`applicationClosesAt` | New this phase. |
| Eligibility Review / Interview / Executive Approval / Offer windows | `ProgrammeWindow` (new model, keyed by `code`) | No consumer yet — see ADR-0013. |
| Application Review Window | `ReviewStage.opensAt`/`closesAt` | Pre-existing (Phase 3A) — reused, not duplicated. |

See `docs/CONFIGURATION_CENTRE_GUIDE.md` for how to edit these.
