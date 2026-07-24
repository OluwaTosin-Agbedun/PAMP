import { Role } from "@/lib/rbac/roles";

import { PERMISSIONS, type Permission } from "./catalog";

const {
  USERS_VIEW,
  USERS_CREATE,
  USERS_UPDATE,
  USERS_DEACTIVATE,
  USERS_MANAGE_STATUS,
  USERS_MANAGE_ROLES,
  USERS_RESET_PASSWORD,
  ROLES_VIEW,
  ROLES_MANAGE,
  PERMISSIONS_VIEW,
  PROGRAMMES_VIEW,
  COHORTS_VIEW,
  APPLICATIONS_VIEW,
  APPLICATIONS_IMPORT,
  APPLICATIONS_EXPORT,
  APPLICATIONS_EDIT,
  APPLICATIONS_DELETE,
  ELIGIBILITY_REVIEW,
  NOTIFICATIONS_ADMINISTER,
  REVIEWS_PERFORM,
  REVIEWS_ASSIGN,
  REVIEWS_VIEW,
  REVIEW_FRAMEWORKS_VIEW,
  REVIEW_FRAMEWORKS_CREATE,
  REVIEW_FRAMEWORKS_UPDATE,
  REVIEW_FRAMEWORKS_PUBLISH,
  REVIEW_FRAMEWORKS_RETIRE,
  REVIEW_SCORES_VIEW,
  REVIEW_SCORES_SUBMIT,
  REVIEW_SCORES_REOPEN,
  ASSIGNMENTS_VIEW,
  ASSIGNMENTS_REASSIGN,
  ASSIGNMENTS_CANCEL,
  CONFLICTS_DECLARE,
  CONFLICTS_MANAGE,
  REVIEWER_CAPACITY_VIEW,
  REVIEWER_CAPACITY_MANAGE,
  REVIEW_OPERATIONS_VIEW,
  REVIEW_ESCALATIONS_VIEW,
  REVIEW_OPERATIONS_EXPORT,
  ADMINISTRATIVE_NOTES_CREATE,
  INTERVIEWS_VIEW,
  INTERVIEWS_SCORE,
  INTERVIEW_ASSIGNMENTS_MANAGE,
  INTERVIEW_CONFLICTS_DECLARE,
  INTERVIEW_CONFLICTS_MANAGE,
  INTERVIEW_OPERATIONS_VIEW,
  INTERVIEW_OPERATIONS_EXPORT,
  INTERVIEW_AVAILABILITY_MANAGE,
  INTERVIEW_SCHEDULING_MANAGE,
  INTERVIEW_TEAMS_MEETING_CREATE,
  INTERVIEW_TEAMS_SYNC_RETRY,
  INTERVIEW_TEAMS_LINK_VIEW,
  INTERVIEW_CANCEL,
  INTERVIEW_SCORES_VIEW_ALL,
  INTERVIEW_SCORING_CLOSE_OVERRIDE,
  INTERVIEW_QUESTIONS_MANAGE,
  INTERVIEW_SESSION_MANAGE,
  COMMITTEE_REVIEW,
  COMMITTEE_VIEW,
  EXECUTIVE_APPROVE,
  EXECUTIVE_VIEW,
  ADMISSIONS_MANAGE,
  ADMISSIONS_VIEW,
  REPORTS_VIEW,
  REPORTS_EXPORT,
  NOTIFICATIONS_VIEW,
  AUDIT_VIEW,
  CONFIGURATION_VIEW,
  CONFIGURATION_MANAGE,
  ELIGIBILITY_RECOMMENDATIONS_CREATE,
  ELIGIBILITY_OVERRIDE_EXECUTE,
  FEATURE_FLAGS_MANAGE,
  RANKING_VIEW,
  RANKING_GENERATE,
  RANKING_APPROVE,
  RANKING_REOPEN,
  RANKING_RESOLVE_TIES,
  RANKING_EXPORT,
  ELIGIBILITY_SCREENING_VIEW,
  ELIGIBILITY_SCREENING_ASSIGN,
  ELIGIBILITY_SCREENING_PERFORM,
  ELIGIBILITY_SCREENING_DISQUALIFY,
  ELIGIBILITY_SCREENING_SECOND_REVIEW,
  ELIGIBILITY_SCREENING_REOPEN,
  ELIGIBILITY_SCREENING_EXPORT,
  ELIGIBILITY_SCREENING_EXTEND_DEADLINE,
} = PERMISSIONS;

const ADMIN_ONLY: Permission[] = [
  USERS_VIEW,
  USERS_CREATE,
  USERS_UPDATE,
  USERS_DEACTIVATE,
  USERS_MANAGE_STATUS,
  USERS_MANAGE_ROLES,
  USERS_RESET_PASSWORD,
  ROLES_VIEW,
  ROLES_MANAGE,
  PERMISSIONS_VIEW,
  // §16: only System Administrator retires a framework or reopens a
  // submitted review — Programme Director's list stops at publish.
  REVIEW_FRAMEWORKS_RETIRE,
  REVIEW_SCORES_REOPEN,
  // Release 1.5 — toggling a feature flag is System-Administrator-only,
  // distinct from the Configuration Centre roles below (Director/
  // Secretary/Admin), since it's a platform-level switch, not a
  // programme-operational value.
  FEATURE_FLAGS_MANAGE,
  // Final Ranking — reopening an approved snapshot mirrors
  // REVIEW_SCORES_REOPEN's exact placement above.
  RANKING_REOPEN,
  // Eligibility Screening — reopening a confirmed decision mirrors the
  // same System-Administrator-only placement as the two reopen
  // permissions above.
  ELIGIBILITY_SCREENING_REOPEN,
];

/** Release 1.5 §"Configuration Centre" — "Only the following roles may
 *  access it: Director, Programme Administrator, System Administrator."
 *  `PROGRAMME_ADMINISTRATOR` in that brief is `PROGRAMME_SECRETARY`
 *  (labelled "Programme Secretary/Admin" — see
 *  docs/ROLE_AND_NAVIGATION_RECONCILIATION.md) — evidence-based mapping,
 *  not a new role. Both view and manage are granted to all three roles
 *  today; kept as two permissions (not one) so a future narrower grant
 *  (e.g. a read-only auditor) is a one-line change, matching Phase 3D's
 *  established view/manage separation. */
const CONFIGURATION_CENTRE: Permission[] = [CONFIGURATION_VIEW, CONFIGURATION_MANAGE];

const PROGRAMME_OVERSIGHT: Permission[] = [
  PROGRAMMES_VIEW,
  COHORTS_VIEW,
  APPLICATIONS_VIEW,
  ELIGIBILITY_REVIEW,
  REVIEWS_VIEW,
  REVIEWS_ASSIGN,
  REVIEW_FRAMEWORKS_VIEW,
  REVIEW_FRAMEWORKS_CREATE,
  REVIEW_FRAMEWORKS_UPDATE,
  REVIEW_FRAMEWORKS_PUBLISH,
  REVIEW_SCORES_VIEW,
  ASSIGNMENTS_VIEW,
  ASSIGNMENTS_REASSIGN,
  CONFLICTS_MANAGE,
  REVIEWER_CAPACITY_VIEW,
  REVIEWER_CAPACITY_MANAGE,
  REVIEW_OPERATIONS_VIEW,
  REVIEW_ESCALATIONS_VIEW,
  REVIEW_OPERATIONS_EXPORT,
  ADMINISTRATIVE_NOTES_CREATE,
  INTERVIEWS_VIEW,
  INTERVIEW_OPERATIONS_VIEW,
  // Microsoft Teams Interview Integration — oversight-tier visibility
  // into the join link, same "aggregate/read visibility, not day-to-day
  // operation" placement as INTERVIEW_OPERATIONS_VIEW above. Does not get
  // TEAMS_MEETING_CREATE/SYNC_RETRY/CANCEL — those stay Secretariat
  // operator actions (see PROGRAMME_SECRETARY below).
  INTERVIEW_TEAMS_LINK_VIEW,
  // Interview Questions (Addendum Module 3) — "configuring the rules
  // governing the process" is Director+Admin, not a Secretariat operator
  // permission.
  INTERVIEW_QUESTIONS_MANAGE,
  COMMITTEE_VIEW,
  EXECUTIVE_VIEW,
  ADMISSIONS_VIEW,
  REPORTS_VIEW,
  REPORTS_EXPORT,
  NOTIFICATIONS_VIEW,
  NOTIFICATIONS_ADMINISTER,
  AUDIT_VIEW,
  ...CONFIGURATION_CENTRE,
  // Final Ranking (Addendum Modules 4-5) — the Director approves
  // (locks) a generated ranking, mirroring REVIEW_FRAMEWORKS_PUBLISH's
  // placement here; generating the ranking itself stays a Secretariat
  // operator action (see PROGRAMME_SECRETARY below), the same split as
  // interview scheduling/assignments.
  RANKING_VIEW,
  RANKING_APPROVE,
  // Eligibility Screening — the Director sees the workspace, exports it,
  // and holds the stricter Disqualify permission (§8.4: "require
  // appropriate permission"), the same oversight-tier placement as
  // RANKING_APPROVE above. Does not get ASSIGN/PERFORM/REOPEN —
  // day-to-day screening stays a Secretariat/screener operation.
  ELIGIBILITY_SCREENING_VIEW,
  ELIGIBILITY_SCREENING_DISQUALIFY,
  ELIGIBILITY_SCREENING_EXPORT,
  ELIGIBILITY_SCREENING_EXTEND_DEADLINE,
];

/**
 * Role → Permission[], applying least privilege: a role has exactly the
 * permissions its job requires, nothing granted "because it's easier."
 * This is the code-based equivalent of a role_permissions join table —
 * see docs/RBAC.md for why it's code, not rows, in this codebase.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SYSTEM_ADMIN]: [...new Set([...ADMIN_ONLY, ...PROGRAMME_OVERSIGHT, ...Object.values(PERMISSIONS)])],

  [Role.PROGRAMME_DIRECTOR]: [...PROGRAMME_OVERSIGHT],

  [Role.PROGRAMME_SECRETARY]: [
    PROGRAMMES_VIEW,
    COHORTS_VIEW,
    APPLICATIONS_VIEW,
    APPLICATIONS_IMPORT,
    APPLICATIONS_EXPORT,
    APPLICATIONS_EDIT,
    // Applicant deletion — the Secretariat is the primary operator of the
    // applicant roster (import/export/edit), so soft-deleting a record
    // they manage day-to-day sits at the same tier as APPLICATIONS_EDIT.
    APPLICATIONS_DELETE,
    ELIGIBILITY_REVIEW,
    REVIEWS_VIEW,
    REVIEW_FRAMEWORKS_VIEW,
    REVIEW_SCORES_VIEW,
    // §10: the Programme Secretary is the primary human operator of the
    // assignment engine — monitors, reassigns (with audit trail), cancels,
    // manages conflicts and reviewer capacity.
    ASSIGNMENTS_VIEW,
    ASSIGNMENTS_REASSIGN,
    ASSIGNMENTS_CANCEL,
    CONFLICTS_MANAGE,
    REVIEWER_CAPACITY_VIEW,
    REVIEWER_CAPACITY_MANAGE,
    // Phase 3D — the Programme Secretariat Review Operations Workspace.
    // The dashboard/monitoring/export permissions are new; everything
    // else the workspace needs (assignment metadata, reassignment,
    // conflicts, capacity, review scores) is already granted above.
    REVIEW_OPERATIONS_VIEW,
    REVIEW_ESCALATIONS_VIEW,
    REVIEW_OPERATIONS_EXPORT,
    ADMINISTRATIVE_NOTES_CREATE,
    INTERVIEWS_VIEW,
    COMMITTEE_VIEW,
    // Global read visibility into Executive Approval, never the approve action.
    EXECUTIVE_VIEW,
    ADMISSIONS_MANAGE,
    ADMISSIONS_VIEW,
    // Analytics Aggregation + Dashboard + Reporting (Planning Phase 5) —
    // "Programme Secretariat and authorised administrators" is the
    // instruction's own stated audience; the Director already held both
    // via PROGRAMME_OVERSIGHT.
    REPORTS_VIEW,
    REPORTS_EXPORT,
    NOTIFICATIONS_VIEW,
    // Notification Infrastructure — the Secretariat is the day-to-day
    // operator: manages templates, monitors delivery, retries/cancels/
    // resends. Same operator-tier placement as its other day-to-day
    // permissions throughout this block.
    NOTIFICATIONS_ADMINISTER,
    ...CONFIGURATION_CENTRE,
    // Release 1.5 §"Governance Resolution" — "Only Programme Secretariat
    // may execute an approved override" of an automated eligibility
    // outcome. The Eligibility Reviewer can only recommend one (below).
    ELIGIBILITY_OVERRIDE_EXECUTE,
    // Release 1 Module 1 — the Programme Secretariat is the primary
    // human operator of the Interview Assignment Engine too, the same
    // role the Phase 3B assignment engine already established.
    INTERVIEW_ASSIGNMENTS_MANAGE,
    INTERVIEW_CONFLICTS_MANAGE,
    INTERVIEW_OPERATIONS_VIEW,
    INTERVIEW_OPERATIONS_EXPORT,
    // Interview Scheduling (Enterprise Functional Specification
    // Addendum) — the Secretariat generates/publishes slots, confirms
    // or declines bookings, enters the Teams link, and sends invitations.
    INTERVIEW_SCHEDULING_MANAGE,
    // Microsoft Teams Interview Integration — the Secretariat is the
    // operator for all of it: creating/re-syncing the real Graph
    // meeting, retrying a failed sync, viewing the link, and cancelling
    // an interview outright.
    INTERVIEW_TEAMS_MEETING_CREATE,
    INTERVIEW_TEAMS_SYNC_RETRY,
    INTERVIEW_TEAMS_LINK_VIEW,
    INTERVIEW_CANCEL,
    // Interview Scoring Revision (Addendum Module 2, §2.4/§2.6) — the
    // Secretariat sees every panellist's scores/comments and the average
    // (mirrors REVIEW_SCORES_VIEW above), and is the only role that may
    // invoke "Close Interview with Three Valid Scores" (§2.6).
    INTERVIEW_SCORES_VIEW_ALL,
    INTERVIEW_SCORING_CLOSE_OVERRIDE,
    // Final Ranking (Addendum Modules 4-5) — the Secretariat is the
    // primary operator: generates/recalculates the ranking and exports
    // it, the same "operator generates, Director approves" split as
    // review frameworks. Does not get RANKING_APPROVE/RANKING_REOPEN.
    RANKING_VIEW,
    RANKING_GENERATE,
    RANKING_EXPORT,
    // Eligibility Screening — the Secretariat assigns screeners, can
    // perform screening itself when needed, holds the stricter
    // Disqualify permission (mirrors ELIGIBILITY_OVERRIDE_EXECUTE's
    // "only Programme Secretariat" placement above), and exports the
    // workspace. Does not get REOPEN (Admin-only).
    ELIGIBILITY_SCREENING_VIEW,
    ELIGIBILITY_SCREENING_ASSIGN,
    ELIGIBILITY_SCREENING_PERFORM,
    ELIGIBILITY_SCREENING_DISQUALIFY,
    ELIGIBILITY_SCREENING_SECOND_REVIEW,
    ELIGIBILITY_SCREENING_EXPORT,
    // The clarification-deadline auto-expiry — same "only Programme
    // Secretariat" tier as Disqualify/Override Execute above.
    ELIGIBILITY_SCREENING_EXTEND_DEADLINE,
  ],

  /**
   * Phase 3B.1: split from the former single REVIEWER role
   * (docs/ROLE_AND_NAVIGATION_RECONCILIATION.md). Originally read-only
   * oversight, back when eligibility screening was fully automatic.
   * The PAM-P 2026 Eligibility Screening Checklist makes a human
   * screener the primary decision-maker instead — this is the role the
   * checklist's own "Assigned Screeners" (Chinaza Igwe, Ijeoma Achebe,
   * Blessed Oladiran) hold real accounts under; their names are never
   * hard-coded into business logic, only into which User rows carry
   * this role. Still gains no *scoring* capability; that stays
   * APPLICATION_REVIEWER's.
   */
  /**
   * QA-only, by design: the Eligibility Reviewer views the automatic
   * engine's outcome and the screening workspace, and may flag a
   * questionable case with a recommended alternative outcome — never
   * decide directly. `ELIGIBILITY_SCREENING_PERFORM` (and the second-
   * review permission that only makes sense alongside it) were removed
   * deliberately: only `ELIGIBILITY_OVERRIDE_EXECUTE` (Programme
   * Secretariat) may actually change `EligibilityScreening.status`. A
   * case randomly assigned to this role (`reviewerAssignment.ts`) is
   * still meaningful under this model — it identifies whose queue a
   * case sits in for QA review, not who may resolve it unilaterally.
   */
  [Role.ELIGIBILITY_REVIEWER]: [
    APPLICATIONS_VIEW,
    ELIGIBILITY_REVIEW,
    NOTIFICATIONS_VIEW,
    ELIGIBILITY_RECOMMENDATIONS_CREATE,
    ELIGIBILITY_SCREENING_VIEW,
  ],

  /**
   * The other half of the REVIEWER split — identical capability set to
   * the pre-split REVIEWER role (a rename, not a capability change):
   * scores applications, submits reviews, declares its own conflicts of
   * interest. Deliberately does not include ELIGIBILITY_REVIEW — an
   * application reviewer has no need for, and this phase's brief
   * explicitly tests for, no eligibility-decision authority.
   */
  [Role.APPLICATION_REVIEWER]: [
    APPLICATIONS_VIEW,
    REVIEWS_PERFORM,
    REVIEWS_VIEW,
    REVIEW_FRAMEWORKS_VIEW,
    REVIEW_SCORES_SUBMIT,
    // A reviewer may declare their own conflict of interest, but does not
    // get ASSIGNMENTS_VIEW — their own-assignment visibility is already
    // covered by repository-level scoping (reviewerId = session.user.id),
    // not a broad view permission (see docs/BLIND_REVIEW.md).
    CONFLICTS_DECLARE,
    NOTIFICATIONS_VIEW,
  ],

  [Role.INTERVIEWER]: [
    APPLICATIONS_VIEW,
    INTERVIEWS_VIEW,
    INTERVIEWS_SCORE,
    NOTIFICATIONS_VIEW,
    // A panellist may declare their own conflict of interest — mirrors
    // APPLICATION_REVIEWER's CONFLICTS_DECLARE. Does not get
    // INTERVIEW_ASSIGNMENTS_MANAGE — reassignment/scheduling stays a
    // Secretariat action.
    INTERVIEW_CONFLICTS_DECLARE,
    // A panellist submits their own availability for the interview
    // period — does not get INTERVIEW_SCHEDULING_MANAGE (slot
    // generation/publishing/confirmation stays a Secretariat action).
    INTERVIEW_AVAILABILITY_MANAGE,
    // A panellist needs to see the Teams join link for their own
    // assigned interview, without gaining the ability to create/
    // reschedule/cancel it (interview_scheduling.manage's job).
    INTERVIEW_TEAMS_LINK_VIEW,
    // Addendum §3 — starting/ending the interview's question session and
    // selecting additional bank questions. Does not get
    // INTERVIEW_QUESTIONS_MANAGE — the bank itself stays Director/Admin
    // configuration, same split as scoring vs. framework elsewhere.
    INTERVIEW_SESSION_MANAGE,
  ],

  [Role.SELECTION_COMMITTEE_MEMBER]: [
    APPLICATIONS_VIEW,
    COMMITTEE_VIEW,
    COMMITTEE_REVIEW,
    NOTIFICATIONS_VIEW,
    // Addendum §2.4 — the Final Selection Committee sees every panellist's
    // interview scores/comments and the average, ahead of its own module
    // (Module 6) being built, per REMAINING_WORK.md's "permission-gate
    // now, consume once the UI exists" instruction.
    INTERVIEW_SCORES_VIEW_ALL,
    // Addendum Module 5, Tie Level 3 — "Final Selection Committee
    // reviews... records mandatory justification." Mirrors
    // COMMITTEE_REVIEW's placement: this role, not Director/Secretary.
    RANKING_VIEW,
    RANKING_RESOLVE_TIES,
  ],

  [Role.EXECUTIVE]: [
    APPLICATIONS_VIEW,
    EXECUTIVE_VIEW,
    EXECUTIVE_APPROVE,
    NOTIFICATIONS_VIEW,
    // Addendum §2.4 — same visibility as the Selection Committee, ahead
    // of Module 8 (Offer/Executive Approval) being built.
    INTERVIEW_SCORES_VIEW_ALL,
    // Same "ahead of its own module" visibility for Final Ranking.
    RANKING_VIEW,
  ],

  // No module access until the Fellow Portal ships in V2 (Phase 0 decision, unchanged).
  [Role.FELLOW]: [],
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}
