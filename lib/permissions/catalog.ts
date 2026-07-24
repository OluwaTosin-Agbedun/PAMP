/**
 * The permission catalogue: every fine-grained capability in the system,
 * as a stable string identifier. This is the "central permission
 * catalogue" — code-defined rather than database rows (see
 * docs/RBAC.md for why), but it is the one and only place a permission
 * identifier is declared. Nothing checks a role name directly; every
 * authorization decision goes through one of these strings via
 * lib/permissions/service.ts.
 *
 * Marked [base] where the identifier is taken verbatim from the Phase 2
 * brief's example catalogue, [ext] where it's an addition this codebase
 * actually needs — see docs/RBAC.md for the full rationale on each
 * addition.
 */
export const PERMISSIONS = {
  // Users [base + ext]
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DEACTIVATE: "users.deactivate",
  /** [ext] Generalizes users.deactivate to the full AccountStatus range
   *  (activate/deactivate/suspend/lock) — the brief's example predates
   *  the multi-state status model this phase adds. Both identifiers are
   *  kept; users.deactivate remains a literal alias-in-spirit, granted
   *  to the same roles. */
  USERS_MANAGE_STATUS: "users.manage_status",
  /** [ext] Role assignment/removal is more sensitive than a name/email
   *  edit — kept separate from users.update. */
  USERS_MANAGE_ROLES: "users.manage_roles",
  /** [ext] Setting/resetting a password is more sensitive than a
   *  general update. */
  USERS_RESET_PASSWORD: "users.reset_password",

  // Roles / permissions — reserved for a future roles-management UI;
  // enforced nowhere yet in V1.0, defined now for catalogue completeness. [base]
  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",
  PERMISSIONS_VIEW: "permissions.view",

  // Programme / cohort — reserved; no dedicated browsing UI yet. [base]
  PROGRAMMES_VIEW: "programmes.view",
  COHORTS_VIEW: "cohorts.view",

  // Applications / applicants [base + ext]
  APPLICATIONS_VIEW: "applications.view",
  /** [ext] Excel/CSV import — built in Sequence 1, needs a permission. */
  APPLICATIONS_IMPORT: "applications.import",
  /** [ext] */
  APPLICATIONS_EXPORT: "applications.export",
  /** [ext] Editing an applicant/application record directly (distinct
   *  from the workflow actions below). */
  APPLICATIONS_EDIT: "applications.edit",
  /** [ext] Soft-deleting an applicant/application record — stricter than
   *  APPLICATIONS_EDIT since it removes the record from every normal
   *  view, not just changes a field. */
  APPLICATIONS_DELETE: "applications.delete",

  // Eligibility [base + ext]
  /** Read access to eligibility decisions/criteria. The brief's
   *  "eligibility.review" is repurposed as *read*, since eligibility
   *  screening is fully automatic in the approved design — there is no
   *  human "review" action to gate. */
  ELIGIBILITY_REVIEW: "eligibility.review",

  // Eligibility Screening (PAM-P 2026 Eligibility Screening Checklist) [ext]
  /** View the screening workspace and one applicant's checklist. Broad —
   *  the same "read is wide, act is narrow" split as everything else in
   *  this catalogue. */
  ELIGIBILITY_SCREENING_VIEW: "eligibility_screening.view",
  /** Assign or reassign a screener — an operator action, mirrors
   *  `assignments.reassign`/`interview_assignments.manage`'s Secretariat
   *  placement. */
  ELIGIBILITY_SCREENING_ASSIGN: "eligibility_screening.assign",
  /** Begin screening, update checklist items, request clarification, and
   *  record Eligible/Clarification Required/Ineligible/Escalate — the
   *  screener's own primary action, held by the role that performs the
   *  screening (§1's "Assigned Screeners"). */
  ELIGIBILITY_SCREENING_PERFORM: "eligibility_screening.perform",
  /** Recording a Disqualified decision — kept separate from the general
   *  perform permission since §8.4 calls out "require appropriate
   *  permission" specifically for this one, more consequential outcome. */
  ELIGIBILITY_SCREENING_DISQUALIFY: "eligibility_screening.disqualify",
  /** Perform a second review — the service layer additionally checks the
   *  second reviewer isn't the original screener. */
  ELIGIBILITY_SCREENING_SECOND_REVIEW: "eligibility_screening.second_review",
  /** Reopen a confirmed screening decision — mirrors
   *  `review_scores.reopen`/`ranking.reopen`'s exact System-Administrator
   *  -only placement. */
  ELIGIBILITY_SCREENING_REOPEN: "eligibility_screening.reopen",
  /** CSV export of the screening workspace — mirrors
   *  `review_operations.export`/`ranking.export`. */
  ELIGIBILITY_SCREENING_EXPORT: "eligibility_screening.export",
  /** Extend an individual application's clarification-response deadline
   *  past the configured default, with a mandatory reason — the same
   *  Secretariat-only tier as `ELIGIBILITY_SCREENING_DISQUALIFY`/
   *  `ELIGIBILITY_OVERRIDE_EXECUTE`, not the general perform permission
   *  every screener holds. */
  ELIGIBILITY_SCREENING_EXTEND_DEADLINE: "eligibility_screening.extend_deadline",

  // Reviews [base + ext]
  REVIEWS_PERFORM: "reviews.perform",
  REVIEWS_ASSIGN: "reviews.assign",
  /** [ext] Read-only visibility distinct from performing a review — the
   *  same "global read, never act" pattern as executive/committee below. */
  REVIEWS_VIEW: "reviews.view",

  // Review frameworks & scoring engine (Phase 3A §15) [base]
  REVIEW_FRAMEWORKS_VIEW: "review_frameworks.view",
  REVIEW_FRAMEWORKS_CREATE: "review_frameworks.create",
  REVIEW_FRAMEWORKS_UPDATE: "review_frameworks.update",
  REVIEW_FRAMEWORKS_PUBLISH: "review_frameworks.publish",
  REVIEW_FRAMEWORKS_RETIRE: "review_frameworks.retire",
  REVIEW_SCORES_VIEW: "review_scores.view",
  /** [ext] "Save own draft scores" and "submit own review" are two
   *  distinct actions in §16, but this codebase's Reviewer role already
   *  has reviews.perform (Sequence 1) covering the draft-save case —
   *  review_scores.submit is the one genuinely new capability the
   *  scoring engine adds: finalizing a review, not just working on one. */
  REVIEW_SCORES_SUBMIT: "review_scores.submit",
  REVIEW_SCORES_REOPEN: "review_scores.reopen",

  // Review assignment engine (Phase 3B) [ext]
  /** View assignment records/analytics — workload, backlog, escalation rate. */
  ASSIGNMENTS_VIEW: "assignments.view",
  /** [ext] Distinct from `reviews.assign` (Sequence 1, kept for triggering
   *  automatic assignment) — reassignment is administratively more
   *  sensitive (§10: "only authorised users," mandatory reason, preserves
   *  history) and gets its own permission. */
  ASSIGNMENTS_REASSIGN: "assignments.reassign",
  ASSIGNMENTS_CANCEL: "assignments.cancel",
  /** A reviewer declaring their own conflict of interest. */
  CONFLICTS_DECLARE: "conflicts.declare",
  /** An administrator recording/viewing conflicts on a reviewer's behalf. */
  CONFLICTS_MANAGE: "conflicts.manage",
  REVIEWER_CAPACITY_VIEW: "reviewer_capacity.view",
  REVIEWER_CAPACITY_MANAGE: "reviewer_capacity.manage",

  // Programme Secretariat review operations workspace (Phase 3D) [ext]
  /** Gates the operations dashboard/workspace itself — distinct from
   *  `assignments.view` (assignment metadata) because this covers the
   *  aggregate dashboard (counts, completion %, utilisation) as a whole,
   *  not any one assignment. Every other Phase 3D screen composes with
   *  the narrower, already-existing permissions below rather than
   *  duplicating them: assignment detail reuses `assignments.view` /
   *  `assignments.reassign`; conflict handling reuses `conflicts.manage`;
   *  reviewer workload reuses `reviewer_capacity.view`; comment/score
   *  visibility reuses `review_scores.view` (Phase 3A) — see
   *  docs/PROGRAMME_SECRETARIAT_WORKSPACE.md for the full reconciliation. */
  REVIEW_OPERATIONS_VIEW: "review_operations.view",
  /** Viewing a `ReviewEscalation` — divergence, both reviewers' scores
   *  side by side, third-review status. Deliberately its own permission
   *  rather than folded into `assignments.view`: seeing that two
   *  reviewers' scores diverged, and by how much, is more sensitive than
   *  ordinary assignment metadata. */
  REVIEW_ESCALATIONS_VIEW: "review_escalations.view",
  /** CSV export of operational data — separate from `reports.export`
   *  (Phase 2's general reporting permission), since this is a distinct,
   *  narrower capability scoped to review-operations data specifically. */
  REVIEW_OPERATIONS_EXPORT: "review_operations.export",
  /** Creating a Secretariat-authored administrative note on an
   *  application — distinct from a reviewer's own review comments. */
  ADMINISTRATIVE_NOTES_CREATE: "administrative_notes.create",

  // Interviews [base + ext]
  INTERVIEWS_VIEW: "interviews.view",
  INTERVIEWS_SCORE: "interviews.score",
  /** [ext] Release 1 Module 1 — scheduling an interview, auto/manually
   *  assigning or reassigning its panel, cancelling a seat. Mirrors
   *  `assignments.reassign`'s "administratively more sensitive than the
   *  reviewer-facing action" split from Phase 3B. */
  INTERVIEW_ASSIGNMENTS_MANAGE: "interview_assignments.manage",
  /** [ext] A panellist declaring their own conflict of interest —
   *  mirrors `conflicts.declare`. */
  INTERVIEW_CONFLICTS_DECLARE: "interview_conflicts.declare",
  /** [ext] An administrator recording a conflict on a panellist's
   *  behalf — mirrors `conflicts.manage`. */
  INTERVIEW_CONFLICTS_MANAGE: "interview_conflicts.manage",
  /** [ext] Gates the Interview Operations Workspace (Module 4) as a
   *  whole — same "aggregate dashboard, not any one interview" pattern
   *  as `review_operations.view` (Phase 3D). */
  INTERVIEW_OPERATIONS_VIEW: "interview_operations.view",
  /** [ext] CSV export of interview operational data — mirrors
   *  `review_operations.export`. */
  INTERVIEW_OPERATIONS_EXPORT: "interview_operations.export",
  /** [ext] Interview Scheduling (Enterprise Functional Specification
   *  Addendum §1.2) — a panellist submitting their own availability/
   *  unavailability/leave for a cohort's interview period. Self-only,
   *  mirrors `interview_conflicts.declare`. */
  INTERVIEW_AVAILABILITY_MANAGE: "interview_availability.manage",
  /** [ext] Interview Scheduling §1.1/1.3–1.8 — generating/publishing
   *  candidate slots, confirming/declining an applicant's booking,
   *  entering the Teams link, and sending invitations. The Secretariat's
   *  primary operator permission for this workflow, the same role that
   *  operates the Panel Assignment Engine (`interview_assignments.manage`). */
  INTERVIEW_SCHEDULING_MANAGE: "interview_scheduling.manage",
  /** [ext] Microsoft Teams Interview Integration — create/reschedule-sync
   *  a real Graph-backed Teams meeting for a confirmed interview.
   *  Reschedule itself (changing `scheduledAt`) and entering a manual
   *  fallback link both stay under `interview_scheduling.manage` — this
   *  one gates specifically the Graph-integration action, since it's the
   *  one capability the brief calls out as needing its own reachability
   *  check (an environment can have scheduling staff without ever
   *  configuring Microsoft Graph). */
  INTERVIEW_TEAMS_MEETING_CREATE: "interview_teams_meeting.create",
  /** [ext] Retrying a failed Teams sync — same actor set as creating one,
   *  broken out because "handle failures/retries" was specified as its
   *  own capability in the brief. */
  INTERVIEW_TEAMS_SYNC_RETRY: "interview_teams_sync.retry",
  /** [ext] Viewing a confirmed interview's Teams join link — broader
   *  than who can manage scheduling: an assigned panellist needs this to
   *  join their own interview, without gaining `interview_scheduling
   *  .manage`'s ability to reschedule/cancel/re-sync it. */
  INTERVIEW_TEAMS_LINK_VIEW: "interview_teams_link.view",
  /** [ext] Cancelling an interview outright (status -> CANCELLED),
   *  cancelling any synced/manual Teams meeting with it. A new
   *  capability — the pre-existing decline/reselection flow only ever
   *  resets a *pending* applicant booking, never ends a confirmed
   *  interview, so this doesn't overload `interview_scheduling.manage`'s
   *  existing meaning. */
  INTERVIEW_CANCEL: "interview.cancel",
  /** [ext] Interview Scoring Revision (Addendum Module 2, §2.4) —
   *  Secretariat/Committee/Executive full visibility into all panellists'
   *  scores and comments for one interview, plus the average. Interview-
   *  side counterpart of `REVIEW_SCORES_VIEW`. */
  INTERVIEW_SCORES_VIEW_ALL: "interview_scores.view_all",
  /** [ext] Addendum §2.6 — "Close Interview with Three Valid Scores."
   *  Interview-side counterpart of `REVIEW_SCORES_REOPEN`. */
  INTERVIEW_SCORING_CLOSE_OVERRIDE: "interview_scoring.close_override",
  /** [ext] Interview Questions (Addendum Module 3) — managing the
   *  mandatory/pathway/additional-bank question bank. "Configuring the
   *  rules governing the process" — same Director+Admin placement as
   *  other rule-configuration permissions, not a Secretariat operator
   *  permission. */
  INTERVIEW_QUESTIONS_MANAGE: "interview_questions.manage",
  /** [ext] Addendum §3 — starting/ending an interview's question
   *  session and selecting additional bank questions during it. A new
   *  fine-grained permission per new panellist-facing capability, same
   *  pattern as `INTERVIEW_AVAILABILITY_MANAGE`/`INTERVIEW_CONFLICTS_DECLARE`,
   *  rather than folding this into `INTERVIEWS_SCORE`. */
  INTERVIEW_SESSION_MANAGE: "interview_session.manage",

  // Selection Committee [base + ext]
  COMMITTEE_REVIEW: "committee.review",
  /** [ext] */
  COMMITTEE_VIEW: "committee.view",

  // Executive Approval [base + ext]
  EXECUTIVE_APPROVE: "executive.approve",
  /** [ext] Programme Secretary has global read visibility into Executive
   *  Approval but never approves — this is what grants the former
   *  without the latter. */
  EXECUTIVE_VIEW: "executive.view",

  // Admissions [base + ext]
  ADMISSIONS_MANAGE: "admissions.manage",
  /** [ext] */
  ADMISSIONS_VIEW: "admissions.view",

  // Reports [base]
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",

  /** [ext] Phase 3B.1 — the "Notifications" navigation taxonomy slot
   *  (docs/ROLE_AND_NAVIGATION_RECONCILIATION.md). Gates a user's own
   *  in-app `Notification` bell — several modules write to that table
   *  today (e.g. eligibility screener assignment). Real outbound email
   *  delivery (`OutboundNotification`) is a separate, narrower-gated
   *  concern — see `NOTIFICATIONS_ADMINISTER` below. */
  NOTIFICATIONS_VIEW: "notifications.view",
  /** [ext] Notification Infrastructure — manage templates, view the
   *  delivery monitoring screen, and retry/cancel/resend an outbound
   *  notification. Deliberately separate from the broadly-granted
   *  `NOTIFICATIONS_VIEW` above (a user's own bell icon) — this is an
   *  admin/operator capability over the whole outbox, the same
   *  oversight-tier placement as `CONFIGURATION_MANAGE` below. */
  NOTIFICATIONS_ADMINISTER: "notifications.administer",

  // Audit [base]
  AUDIT_VIEW: "audit.view",

  // Enterprise Configuration Centre (Release 1.5) [ext]
  /** Read access to the Configuration Centre — separate from
   *  `configuration.manage` (Phase 3D's established "view is a distinct,
   *  narrower permission from the mutating one, even when currently
   *  co-granted" pattern), so a future read-only auditor role is a
   *  one-line grant change, not new plumbing. */
  CONFIGURATION_VIEW: "configuration.view",
  /** [ext] Changing a configuration value. Occupies the conceptual slot
   *  the Phase 2 brief's `system.configure` was reserved for but never
   *  wired to anything — renamed rather than left dead alongside a new,
   *  overlapping identifier (repurposed, not duplicated; confirmed
   *  unused anywhere before this rename). */
  CONFIGURATION_MANAGE: "configuration.manage",

  /** [ext] Release 1.5 §"Governance Resolution" — an Eligibility
   *  Reviewer flagging an automated eligibility outcome and submitting a
   *  recommendation. Distinct from `eligibility.review` (read-only
   *  visibility, Phase 3B.1) — this is the one new write action the role
   *  gains, and it still isn't a decision: see
   *  docs/ELIGIBILITY_QA_GOVERNANCE.md. */
  ELIGIBILITY_RECOMMENDATIONS_CREATE: "eligibility_recommendations.create",
  /** [ext] Executing an approved override of an automated eligibility
   *  result — "Only Programme Secretariat may execute an approved
   *  override" (Release 1.5 brief, verbatim). Deliberately a different
   *  permission from the recommendation above: the role that flags a
   *  case is never the role that can act on it. */
  ELIGIBILITY_OVERRIDE_EXECUTE: "eligibility_override.execute",

  /** [ext] Toggling a feature flag — a platform-administration action,
   *  not an ordinary configuration value; kept separate from
   *  `configuration.manage` so flags can be governed more narrowly than
   *  the rest of the Configuration Centre if that's ever needed. */
  FEATURE_FLAGS_MANAGE: "feature_flags.manage",

  // Final Ranking (Addendum Modules 4-5) [ext]
  /** View the Final Ranking Workspace and a candidate's ranking detail.
   *  Granted to the same "ahead of its own module" selection-stage roles
   *  (Committee/Executive) already hold INTERVIEW_SCORES_VIEW_ALL for. */
  RANKING_VIEW: "ranking.view",
  /** Generate/recalculate a RankingSnapshot for a cohort — the
   *  Secretariat's day-to-day operator action, mirrors
   *  `INTERVIEW_SCHEDULING_MANAGE`/`INTERVIEW_ASSIGNMENTS_MANAGE`. */
  RANKING_GENERATE: "ranking.generate",
  /** Approve (lock) a generated ranking snapshot — a governance sign-off
   *  action, mirrors `REVIEW_FRAMEWORKS_PUBLISH`'s Director+Admin-only
   *  placement (Secretary, who generates, does not also approve). */
  RANKING_APPROVE: "ranking.approve",
  /** Reopen an approved (locked) ranking snapshot — mirrors
   *  `REVIEW_SCORES_REOPEN`'s exact System-Administrator-only placement. */
  RANKING_REOPEN: "ranking.reopen",
  /** Record a Level 3 tie's committee decision (Addendum Module 5) —
   *  mirrors `COMMITTEE_REVIEW`'s Selection-Committee-Member-only
   *  placement, not granted to Director/Secretary. */
  RANKING_RESOLVE_TIES: "ranking.resolve_ties",
  /** CSV export of the ranking workspace — mirrors
   *  `REVIEW_OPERATIONS_EXPORT`/`INTERVIEW_OPERATIONS_EXPORT`. */
  RANKING_EXPORT: "ranking.export",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);
