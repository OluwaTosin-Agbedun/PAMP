/**
 * The Configuration Centre's single source of truth (Release 1.5).
 * Every admin-tunable value is one entry here — the generic accessors in
 * `./service.ts`, the Zod validation in
 * `modules/configuration/validation/schemas.ts`, and the Configuration
 * Centre's category screens are all *driven by* this list rather than
 * each hand-declaring their own copy of "what settings exist" — one
 * array, so a new setting is one new entry, not four coordinated edits.
 *
 * Every key is still stored as a single `SystemSetting` row (the generic
 * key/value table from the database-design phase) — Release 1.5
 * deliberately extends that existing store rather than adding seven new
 * category-specific tables. See docs/adr/ADR-0013-configuration-centre-storage.md.
 */

export type SettingType = "number" | "boolean" | "string";

export type SettingCategory =
  | "programme"
  | "eligibility"
  | "review"
  | "interview"
  | "scoring"
  | "notification"
  | "reports"
  | "file_upload"
  | "security"
  | "feature";

export type SettingDefinition = {
  key: string;
  category: SettingCategory;
  type: SettingType;
  label: string;
  description: string;
  default: number | boolean | string;
  /** Numeric settings only. */
  min?: number;
  max?: number;
  /** String settings with a fixed, currently-single-valued choice set —
   *  documents intent without inventing a pluggability the codebase
   *  doesn't implement (see readOnly settings below). */
  options?: string[];
  /** True for a value that is genuinely live-configurable and consumed
   *  by existing code. False (the default) for a value that is either
   *  read-only/informational (the underlying behaviour is structural,
   *  not a flag — e.g. blind review) or stored for a future phase with
   *  no consumer yet (e.g. every Notification/Interview value) — see
   *  each entry's description for which case it is. Both are honestly
   *  distinguished in the UI rather than presented identically. */
  readOnly?: boolean;
};

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  // ---------------------------------------------------------------------
  // Eligibility Screening Configuration
  // ---------------------------------------------------------------------
  {
    key: "eligibility.clarification_deadline_hours",
    category: "eligibility",
    type: "number",
    label: "Clarification response window (hours)",
    description:
      "How long an applicant has to respond once a screening enters Clarification Required before checkMissedClarificationDeadlines (app/api/cron/process-notifications) auto-marks it Ineligible. PAM-P 2026 default is 24 hours. Set the moment a screening enters Clarification Required (modules/eligibility/screeningService.ts); a Secretariat account can extend an individual application's deadline with a mandatory reason.",
    default: 24,
    min: 1,
    max: 720,
  },

  // ---------------------------------------------------------------------
  // Review Configuration
  // ---------------------------------------------------------------------
  {
    key: "review.reviewers_per_application",
    category: "review",
    type: "number",
    label: "Number of reviewers",
    description:
      "Informational, not editable: the assignment engine's slot model (ReviewSlot: FIRST/SECOND, with THIRD reserved for the separate third-review escalation path, not a third initial reviewer) is structurally built for exactly two initial reviewers per application — blind-pairing, divergence calculation, and escalation all assume a pair. Changing this is an assignment-engine redesign, out of scope for Release 1.5 (\"do not redesign existing architecture\"). Flagged here rather than presented as a live, changeable value.",
    default: 2,
    readOnly: true,
  },
  {
    key: "review.third_review_divergence_threshold_percent",
    category: "review",
    type: "number",
    label: "Third review threshold",
    description: "Percentage-point score difference between Reviewer 1 and Reviewer 2 that triggers a third review.",
    default: 20,
    min: 0,
    max: 100,
  },
  {
    key: "review.blind_review_enabled",
    category: "review",
    type: "boolean",
    label: "Blind review",
    description:
      "Reviewer 1 and Reviewer 2 never see each other's scores or comments. This is enforced structurally in every assignment/review query (see docs/BLIND_REVIEW.md), not by this flag — shown here for visibility, not editable, so a future config export/audit accurately reflects that the guarantee is always on.",
    default: true,
    readOnly: true,
  },
  {
    key: "review.reviewer_default_max_concurrent_assignments",
    category: "review",
    type: "number",
    label: "Maximum reviewer workload",
    description: "Default maximum concurrent assignments for a reviewer with no individually configured capacity.",
    default: 10,
    min: 1,
    max: 100,
  },
  {
    key: "review.reassignment_rules_summary",
    category: "review",
    type: "string",
    label: "Reviewer reassignment rules",
    description:
      "Server-enforced on every reassignment, not a tunable value: rejects the same reviewer, a conflicted reviewer, an inactive reviewer, and a reviewer over capacity; requires a reason; preserves assignment history. See docs/REVIEW_REASSIGNMENT.md.",
    default: "Enforced in modules/reviews/services/assignmentService.ts — see docs/REVIEW_REASSIGNMENT.md",
    readOnly: true,
  },
  {
    key: "review.automatic_assignment_enabled",
    category: "review",
    type: "boolean",
    label: "Automatic assignment",
    description: "When on, a newly eligible application is auto-assigned reviewers immediately. When off, assignment must be triggered manually.",
    default: true,
  },
  {
    key: "review.completion_deadline_summary",
    category: "review",
    type: "string",
    label: "Review completion deadline",
    description:
      "Set per cohort as the Application Review Window's close date on the Programme Configuration screen, not here — it is a real database field (ReviewStage.closesAt), not a generic setting.",
    default: "See Programme Configuration → Application Review Window",
    readOnly: true,
  },
  {
    key: "review.reminder_frequency_days",
    category: "review",
    type: "number",
    label: "Review reminder frequency (days)",
    description:
      "How often an overdue-review reminder would be sent. Stored for the future notification engine — no delivery mechanism exists yet in this codebase (see Notification Configuration below), so this value currently has no consumer.",
    default: 3,
    min: 1,
    max: 30,
  },

  // ---------------------------------------------------------------------
  // Interview Configuration — Release 1.5 §"Interview Configuration":
  // "No interview functionality should be built yet. Only configuration."
  // Every key below is stored with zero consumer, on purpose.
  // ---------------------------------------------------------------------
  {
    key: "interview.panellist_count",
    category: "interview",
    type: "number",
    label: "Number of interview panellists",
    description:
      "Consumed by the Interview Assignment Engine (Release 1 Module 1) — how many panellists it auto-assigns to each interview. Default is 4, per the approved panel size.",
    default: 4,
    min: 1,
    max: 10,
  },
  {
    key: "interview.duration_minutes",
    category: "interview",
    type: "number",
    label: "Interview duration (minutes)",
    description:
      "Consumed by the Interview Scheduling engine's slot generator (Enterprise Functional Specification Addendum §1.3) — the length of each interview block, before the mandatory buffer.",
    default: 30,
    min: 10,
    max: 180,
  },
  {
    key: "interview.buffer_minutes",
    category: "interview",
    type: "number",
    label: "Mandatory buffer between interviews (minutes)",
    description:
      "Consumed by the Interview Scheduling engine's slot generator (§1.3) — added after each interview's duration before the next slot may start (duration + buffer = the scheduling block size).",
    default: 5,
    min: 0,
    max: 60,
  },
  {
    key: "interview.max_interviews_per_day",
    category: "interview",
    type: "number",
    label: "Maximum confirmed interviews per day",
    description:
      "Consumed by the Interview Scheduling engine (§1.4) — the cohort-wide daily capacity; slot generation excludes any day already at this many confirmed interviews.",
    default: 4,
    min: 1,
    max: 50,
  },
  {
    key: "interview.reminder_hours_before",
    category: "interview",
    type: "string",
    label: "Reminder timing (hours before interview)",
    description:
      "Consumed by sendDueReminders (modules/interviews/services/schedulingService.ts), invoked periodically by the external scheduler hitting /api/cron/process-notifications — comma-separated hours-before-interview at which a reminder is due, e.g. \"72,24,1\" per Interview Configuration §4. Each due threshold enqueues a real INTERVIEW_REMINDER email via Notification Infrastructure (docs/NOTIFICATIONS.md).",
    default: "72,24,1",
  },
  {
    key: "interview.timezone",
    category: "interview",
    type: "string",
    label: "Interview time zone",
    description:
      "Microsoft Teams Interview Integration — the IANA time zone Microsoft Graph schedules every synced Teams meeting in (Graph's dateTimeTimeZone convention). Doesn't affect scheduledAt itself, which is always stored in UTC — only what time zone the calendar invite and this setting's own display show.",
    default: "Africa/Lagos",
  },
  {
    key: "interview.booking_token_ttl_hours",
    category: "interview",
    type: "number",
    label: "Booking link validity (hours)",
    description:
      "Consumed by the Interview Scheduling engine — how long an applicant's interview-booking link stays valid after slots are published, before the Secretariat must regenerate it. A technical security parameter (token lifetime), not a business rule the specification defines a value for.",
    default: 168,
    min: 1,
    max: 720,
  },
  {
    key: "interview.passing_score",
    category: "interview",
    type: "number",
    label: "Passing score",
    description: "Configuration only — the Interview Engine is not built this phase.",
    default: 70,
    min: 0,
    max: 100,
  },
  {
    key: "interview.weighting_percent",
    category: "interview",
    type: "number",
    label: "Interview weighting (%)",
    description: "Configuration only — the Interview Engine is not built this phase.",
    default: 30,
    min: 0,
    max: 100,
  },
  {
    key: "interview.tie_break_rule",
    category: "interview",
    type: "string",
    label: "Tie-break rule",
    description: "Configuration only — the Interview Engine is not built this phase.",
    default: "CHAIR_DECIDES",
    options: ["CHAIR_DECIDES", "RE_VOTE"],
  },
  {
    key: "interview.reserve_list_size",
    category: "interview",
    type: "number",
    label: "Reserve list size",
    description: "Configuration only — the Interview Engine is not built this phase.",
    default: 10,
    min: 0,
    max: 100,
  },
  {
    key: "interview.scheduling_window_days",
    category: "interview",
    type: "number",
    label: "Interview scheduling window (days)",
    description: "Configuration only — the Interview Engine is not built this phase.",
    default: 14,
    min: 1,
    max: 90,
  },

  // ---------------------------------------------------------------------
  // Scoring Configuration
  // ---------------------------------------------------------------------
  {
    key: "scoring.total_score",
    category: "scoring",
    type: "number",
    label: "Total score",
    description:
      "Informational — the actual total is per-framework (ReviewFramework.totalConfiguredScore, computed at publish time from its criteria). Shown here as the conventional value used across every framework published so far.",
    default: 100,
    readOnly: true,
  },
  {
    key: "scoring.stage_weightings_summary",
    category: "scoring",
    type: "string",
    label: "Stage weightings",
    description: "V1.0 runs a single scored stage (Application Review) — multi-stage weighting has no implementation to configure yet.",
    default: "Single-stage V1.0 — Application Review is the only scored stage today.",
    readOnly: true,
  },
  {
    key: "scoring.passing_threshold",
    category: "scoring",
    type: "number",
    label: "Passing threshold",
    description: "Stored for the future ranking/admissions phases — no consumer reads this yet (RankingSnapshot/ApplicationScore are schema-only).",
    default: 60,
    min: 0,
    max: 100,
  },
  {
    key: "scoring.ranking_method",
    category: "scoring",
    type: "string",
    label: "Ranking method",
    description: "Informational — ReviewScoringMethod has exactly one implemented value; there is no second strategy to choose between yet.",
    default: "WEIGHTED_SUM",
    readOnly: true,
  },
  {
    key: "scoring.third_review_calculation_strategy",
    category: "scoring",
    type: "string",
    label: "Third-review calculation strategy",
    description:
      "Informational — the one implemented strategy (modules/reviews/domain/thirdReviewEngine.ts): the lower of Reviewer 1/Reviewer 2's scores, averaged with the third reviewer's score.",
    default: "LOWER_OF_FIRST_TWO_PLUS_THIRD_AVERAGED",
    readOnly: true,
  },
  {
    key: "scoring.minimum_qualifying_score",
    category: "scoring",
    type: "number",
    label: "Minimum qualifying score",
    description: "Stored for the future ranking/admissions phases — no consumer reads this yet.",
    default: 50,
    min: 0,
    max: 100,
  },
  {
    key: "ranking.top70Size",
    category: "scoring",
    type: "number",
    label: "Interview shortlist size",
    description:
      "Consumed by the Interview Assignment Engine (Release 1 Module 1) — how many of the highest review-scoring eligible applications advance to interview. Named to match the key docs/database.md already documented as the intended setting for this value.",
    default: 70,
    min: 1,
    max: 1000,
  },
  {
    key: "ranking.finalCohortSize",
    category: "scoring",
    type: "number",
    label: "Final cohort size",
    description:
      "Consumed by the Final Ranking Engine (Addendum Module 4) — how many of the highest final-scoring eligible applications the generated ranking snapshot covers. The Addendum confirms this programme's cohort size as Top 30 (docs/architecture.md); kept configurable, matching ranking.top70Size's existing pattern, rather than hardcoded.",
    default: 30,
    min: 1,
    max: 1000,
  },
  {
    key: "ranking.reserveListSize",
    category: "scoring",
    type: "number",
    label: "Reserve list size",
    description:
      "Consumed by the Final Ranking Engine — how many applications immediately below the final cohort size the ranking snapshot also covers, as reserve-list readiness (Addendum Module 7: \"Reserve list size shall be configurable\"). No default number is given in any approved source document; 15 is a placeholder pending programme-owner confirmation, the same flagged-assumption pattern as ADR-0015.",
    default: 15,
    min: 0,
    max: 1000,
  },

  // ---------------------------------------------------------------------
  // Notification Configuration — Notification Infrastructure. Real
  // delivery now exists (Microsoft Graph Mail, `lib/msgraph/mailClient
  // .ts` — see docs/NOTIFICATIONS.md); the keys below that feed it are
  // called out individually. `notification.reminder_interval_days`,
  // `.timing`, and `.escalation_timing_days` are unrelated generic
  // placeholders from an earlier phase with no consumer yet — left as
  // configuration only, honestly, rather than stretched to mean
  // something new.
  // ---------------------------------------------------------------------
  {
    key: "notification.enabled",
    category: "notification",
    type: "boolean",
    label: "Notifications enabled",
    description: "Superseded by the feature.ai_assistant-style platform flag feature.notifications (Administration → Feature Flags, System Administrator only) — that flag is the one thing every send actually checks. Kept for backward compatibility; has no consumer of its own.",
    default: false,
  },
  {
    key: "notification.reminder_interval_days",
    category: "notification",
    type: "number",
    label: "Reminder interval (days)",
    description: "Configuration only — not yet consumed by anything in this codebase (unrelated to Interview reminders, which use interview.reminder_hours_before instead).",
    default: 3,
    min: 1,
    max: 30,
  },
  {
    key: "notification.timing",
    category: "notification",
    type: "string",
    label: "Notification send time",
    description: "Configuration only — not yet consumed by anything in this codebase.",
    default: "09:00",
  },
  {
    key: "notification.sender_name",
    category: "notification",
    type: "string",
    label: "Email sender name",
    description: "The display \"From\" name on every outbound notification email sent via Microsoft Graph Mail.",
    default: "PAM-P Fellowship Programme",
  },
  {
    key: "notification.reply_address",
    category: "notification",
    type: "string",
    label: "Email reply address",
    description: "The Reply-To address on every outbound notification email — set to a monitored inbox, not the Graph sender mailbox itself, so applicant replies reach a real person.",
    default: "noreply@pam-p.org",
  },
  {
    key: "notification.escalation_timing_days",
    category: "notification",
    type: "number",
    label: "Escalation timing (days)",
    description: "Configuration only — not yet consumed by anything in this codebase.",
    default: 2,
    min: 1,
    max: 30,
  },
  {
    key: "notification.retry_limit",
    category: "notification",
    type: "number",
    label: "Delivery retry limit",
    description: "Maximum automatic retry attempts for a failed send before it's left in Failed status awaiting a manual retry from the delivery monitoring screen.",
    default: 3,
    min: 0,
    max: 10,
  },

  // ---------------------------------------------------------------------
  // Reports Configuration (Planning Phase 5)
  // ---------------------------------------------------------------------
  {
    key: "reports.default_date_range_days",
    category: "reports",
    type: "number",
    label: "Default date-range filter (days)",
    description: "How many days back the Analytics Dashboard's date-range filter defaults to when no explicit range is chosen. The dashboard itself is always compute-on-read against live data — there's no refresh interval or cached snapshot to configure.",
    default: 90,
    min: 1,
    max: 730,
  },

  // ---------------------------------------------------------------------
  // File Upload Configuration
  // ---------------------------------------------------------------------
  {
    key: "file_upload.max_size_mb",
    category: "file_upload",
    type: "number",
    label: "Maximum upload size (MB)",
    description: "Enforced server-side on applicant import — previously the only check was rejecting an empty file.",
    default: 10,
    min: 1,
    max: 200,
  },
  {
    key: "file_upload.allowed_file_types",
    category: "file_upload",
    type: "string",
    label: "Allowed file types",
    description: "Comma-separated extensions, enforced server-side on applicant import (previously a client-side <input accept> hint only).",
    default: ".xlsx,.xls,.csv",
  },
  {
    key: "file_upload.max_documents",
    category: "file_upload",
    type: "number",
    label: "Maximum documents per application",
    description: "Stored for the future document-upload feature — ApplicationDocument exists in the schema but has no consumer code anywhere yet.",
    default: 5,
    min: 1,
    max: 50,
  },
  {
    key: "file_upload.virus_scan_required",
    category: "file_upload",
    type: "boolean",
    label: "Require virus scan",
    description: "Stored for the future document-upload feature — no scanning integration exists yet.",
    default: false,
  },
  {
    key: "file_upload.image_compression_enabled",
    category: "file_upload",
    type: "boolean",
    label: "Image compression",
    description: "Stored for the future document-upload feature — no consumer exists yet.",
    default: false,
  },
  {
    key: "file_upload.document_retention_days",
    category: "file_upload",
    type: "number",
    label: "Document retention (days)",
    description: "Stored for the future document-upload feature — no retention/purge job exists yet.",
    default: 365,
    min: 30,
    max: 3650,
  },

  // ---------------------------------------------------------------------
  // Security Configuration
  // ---------------------------------------------------------------------
  {
    key: "security.session_timeout_minutes",
    category: "security",
    type: "number",
    label: "Session timeout (minutes)",
    description:
      "Auth.js's JWT session config is read once at process start, not per-request — changing this value takes effect on the next application restart/deploy, not live. Default matches Auth.js's own built-in default (30 days) so nothing changes until an administrator deliberately sets it.",
    default: 43200,
    min: 5,
    max: 129600,
  },
  {
    key: "security.password_min_length",
    category: "security",
    type: "number",
    label: "Minimum password length",
    description: "Enforced live on every password set/change (registration, admin reset, self-service change).",
    default: 10,
    min: 8,
    max: 128,
  },
  {
    key: "security.password_require_uppercase",
    category: "security",
    type: "boolean",
    label: "Require an uppercase letter",
    description: "Enforced live on every password set/change.",
    default: true,
  },
  {
    key: "security.password_require_lowercase",
    category: "security",
    type: "boolean",
    label: "Require a lowercase letter",
    description: "Enforced live on every password set/change.",
    default: true,
  },
  {
    key: "security.password_require_number",
    category: "security",
    type: "boolean",
    label: "Require a number",
    description: "Enforced live on every password set/change.",
    default: true,
  },
  {
    key: "security.password_require_special",
    category: "security",
    type: "boolean",
    label: "Require a special character",
    description: "Enforced live on every password set/change.",
    default: true,
  },
  {
    key: "security.failed_login_threshold",
    category: "security",
    type: "number",
    label: "Failed login threshold",
    description:
      "Stored, not yet automatically enforced — this codebase logs every failed login (USER_LOGIN_FAILED) but has never counted attempts or auto-locked an account; the LOCKED status is administrator-set only today. See docs/AUTHENTICATION.md.",
    default: 5,
    min: 1,
    max: 20,
  },
  {
    key: "security.account_lock_duration_minutes",
    category: "security",
    type: "number",
    label: "Account lock duration (minutes)",
    description: "Stored, not yet automatically enforced — see failed login threshold above.",
    default: 30,
    min: 1,
    max: 10080,
  },
  {
    key: "security.mfa_required",
    category: "security",
    type: "boolean",
    label: "Require MFA",
    description: "Future flag, as named in the brief — no MFA implementation exists in this codebase.",
    default: false,
  },
  {
    key: "security.audit_retention_days",
    category: "security",
    type: "number",
    label: "Audit retention (days)",
    description: "Stored — no purge/archival job exists yet; AuditLog rows are retained indefinitely today regardless of this value.",
    default: 730,
    min: 30,
    max: 36500,
  },

  // ---------------------------------------------------------------------
  // Feature Flags (Release 1.5 §"Feature Flags") — stored in the same
  // generic settings table via the same audited accessors; exposed to
  // the rest of the codebase through the purpose-named wrapper in
  // lib/featureFlags/service.ts rather than callers reaching into the
  // settings module directly. "No feature should require code removal
  // to disable" — every flag below gates an already-built, already-
  // shipped feature (or, for interview_module, a not-yet-built one) by
  // an if-check at its entry point, not by deleting code.
  // ---------------------------------------------------------------------
  {
    key: "feature.interview_module",
    category: "feature",
    type: "boolean",
    label: "Interview Module",
    description: "Gates every staff-facing /interviews route (scheduling, scoring, questions, availability — see app/(dashboard)/interviews/layout.tsx). The module is already built and shipped, so — same precedent as feature.exports below — this defaults on to preserve existing behaviour; an administrator can turn it off to take the module offline without a deploy. Never gates the applicant-facing booking link, which must keep working regardless.",
    default: true,
  },
  {
    key: "feature.notifications",
    category: "feature",
    type: "boolean",
    label: "Notifications",
    description: "The one gate every real outbound send actually checks (modules/notifications) — off by default so nothing sends until an administrator deliberately turns it on, even once Microsoft Graph credentials are configured. See docs/NOTIFICATIONS.md.",
    default: false,
  },
  {
    key: "feature.executive_dashboard",
    category: "feature",
    type: "boolean",
    label: "Executive Dashboard",
    description: "Gates /executive-approval — the cohort summary and the Top 70/Top 60/Final Selection/Verification & Confirmation staged sign-off workflow. Brand new, never reachable before this route existed, so this defaults off (unlike feature.interview_module's already-shipped precedent) until an administrator deliberately turns it on.",
    default: false,
  },
  {
    key: "feature.exports",
    category: "feature",
    type: "boolean",
    label: "Exports",
    description: "Gates the Phase 3D Review Operations CSV export, which is already built and shipped — defaults on so existing behaviour is unchanged until an administrator turns it off.",
    default: true,
  },
  {
    key: "feature.analytics",
    category: "feature",
    type: "boolean",
    label: "Analytics",
    description: "Gates /reports — the Application/Review/Interview/Final Ranking/Admission/Notification Analytics Dashboard and its CSV export. Brand new, never reachable before this route existed, so this defaults off until an administrator turns it on.",
    default: false,
  },
  {
    key: "feature.ai_assistant",
    category: "feature",
    type: "boolean",
    label: "Future AI Assistant",
    description: "Not built — reserved, as named in the brief.",
    default: false,
  },
];

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTINGS_REGISTRY.find((s) => s.key === key);
}

export function listSettingsByCategory(category: SettingCategory): SettingDefinition[] {
  return SETTINGS_REGISTRY.filter((s) => s.category === category);
}
