/**
 * The full notification event catalogue — Programme Identity §10's
 * applicant-facing list, extended with the additional applicant events
 * and the internal (staff-facing) events this planning instruction's
 * §5.1 calls out. Deliberately a `string`, not a database enum
 * (`OutboundNotification.event`) — a new event added here never needs a
 * migration, matching this codebase's existing "central catalogue, not
 * rows" convention (docs/RBAC.md) applied to the same problem here.
 *
 * Cataloguing an event here does not mean something in the codebase
 * fires it yet — it means the event, its recipient shape, and its
 * default template are all defined so a later phase's real trigger
 * point only ever has to call `enqueueNotification`, never invent a new
 * template or wonder what variables are available. See
 * docs/NOTIFICATIONS.md for exactly which events are wired to a real
 * trigger today.
 */

export type NotificationRecipientKind = "APPLICANT" | "USER";

export type NotificationEventDefinition = {
  key: string;
  label: string;
  recipient: NotificationRecipientKind;
  /** Names every `{{variable}}` the default template may reference —
   *  not enforced at the type level (variables are a plain
   *  `Record<string, string>` at the call site), but used by the
   *  template editor to show which placeholders are available. */
  variables: string[];
};

export const NOTIFICATION_EVENTS = {
  // Applicant-facing — Programme Identity §10
  APPLICATION_SUBMITTED: {
    key: "APPLICATION_SUBMITTED",
    label: "Application Submitted",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "programmeName", "cohortYear"],
  },
  ELIGIBILITY_CLARIFICATION_REQUIRED: {
    key: "ELIGIBILITY_CLARIFICATION_REQUIRED",
    label: "Clarification Required",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "clarificationReason"],
  },
  ELIGIBILITY_CLARIFICATION_RESOLVED: {
    key: "ELIGIBILITY_CLARIFICATION_RESOLVED",
    label: "Clarification Response Received",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  ELIGIBLE: {
    key: "ELIGIBLE",
    label: "Eligible",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  INELIGIBLE: {
    key: "INELIGIBLE",
    label: "Ineligible",
    recipient: "APPLICANT",
    // Deliberately no "reason" placeholder — a screener's
    // `reasonForDecision` is internal justification, not necessarily
    // safe applicant-facing wording (docs/NOTIFICATIONS.md's "never
    // send internal-only content to applicants"). If a specific,
    // applicant-safe reason is ever needed here, it should be its own
    // explicit field a screener writes for the applicant, the same way
    // `outstandingClarification` already is for the Clarification
    // Required event — not this decision's internal reasoning reused.
    variables: ["applicantFirstName"],
  },
  DISQUALIFIED: {
    key: "DISQUALIFIED",
    label: "Disqualified",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  SHORTLISTED: {
    key: "SHORTLISTED",
    label: "Shortlisted",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  RESERVE: {
    key: "RESERVE",
    label: "Reserve",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  NOT_SHORTLISTED: {
    key: "NOT_SHORTLISTED",
    label: "Not Shortlisted",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  INTERVIEW_INVITATION: {
    key: "INTERVIEW_INVITATION",
    label: "Interview Invitation",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "interviewDate", "interviewStartTime", "interviewTimezone", "joinLink"],
  },
  INTERVIEW_REMINDER: {
    key: "INTERVIEW_REMINDER",
    label: "Interview Reminder",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "interviewDate", "interviewStartTime", "interviewTimezone", "joinLink", "hoursBefore"],
  },
  INTERVIEW_RESCHEDULED: {
    key: "INTERVIEW_RESCHEDULED",
    label: "Interview Rescheduled",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "interviewDate", "interviewStartTime", "interviewTimezone", "rescheduleReason"],
  },
  INTERVIEW_CANCELLED: {
    key: "INTERVIEW_CANCELLED",
    label: "Interview Cancelled",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "cancellationReason"],
  },
  SELECTED: {
    key: "SELECTED",
    label: "Selected",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  FINAL_RESERVE_LIST: {
    key: "FINAL_RESERVE_LIST",
    label: "Final Reserve List",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  NOT_SELECTED: {
    key: "NOT_SELECTED",
    label: "Not Selected",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  OFFER_ISSUED: {
    key: "OFFER_ISSUED",
    label: "Offer Issued",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "offerDeadline", "offerInstructions"],
  },
  ACCEPTANCE_RECEIVED: {
    key: "ACCEPTANCE_RECEIVED",
    label: "Acceptance Received",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  OFFER_DECLINED: {
    key: "OFFER_DECLINED",
    label: "Offer Declined",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  OFFER_LAPSED: {
    key: "OFFER_LAPSED",
    label: "Offer Lapsed",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  ONBOARDING: {
    key: "ONBOARDING",
    label: "Onboarding",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "onboardingDate"],
  },
  PROGRAMME_COMMENCEMENT: {
    key: "PROGRAMME_COMMENCEMENT",
    label: "Programme Commencement",
    recipient: "APPLICANT",
    variables: ["applicantFirstName", "startDate"],
  },
  GRADUATION: {
    key: "GRADUATION",
    label: "Graduation",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },
  ALUMNI_ACTIVATION: {
    key: "ALUMNI_ACTIVATION",
    label: "Alumni Activation",
    recipient: "APPLICANT",
    variables: ["applicantFirstName"],
  },

  // Internal — staff-facing, this planning instruction §5.1
  INTEGRITY_CONCERN_RAISED: {
    key: "INTEGRITY_CONCERN_RAISED",
    label: "Integrity Concern",
    recipient: "USER",
    variables: ["applicantName", "concernSummary"],
  },
  DUPLICATE_APPLICATION_DETECTED: {
    key: "DUPLICATE_APPLICATION_DETECTED",
    label: "Duplicate Application",
    recipient: "USER",
    variables: ["applicantName"],
  },
  REVIEWER_CONFLICT_DECLARED: {
    key: "REVIEWER_CONFLICT_DECLARED",
    label: "Reviewer Conflict",
    recipient: "USER",
    variables: ["applicantName", "reviewerName"],
  },
  REVIEWER_DEADLINE_EXCEEDED: {
    key: "REVIEWER_DEADLINE_EXCEEDED",
    label: "Reviewer Deadline Exceeded",
    recipient: "USER",
    variables: ["applicantName", "reviewerName"],
  },
  THIRD_REVIEWER_TRIGGERED: {
    key: "THIRD_REVIEWER_TRIGGERED",
    label: "Third Reviewer Triggered",
    recipient: "USER",
    variables: ["applicantName"],
  },
  INTERVIEW_SCORING_INCOMPLETE: {
    key: "INTERVIEW_SCORING_INCOMPLETE",
    label: "Interview Scoring Incomplete",
    recipient: "USER",
    variables: ["applicantName", "interviewDate"],
  },
  EXECUTIVE_APPROVAL_REQUIRED: {
    key: "EXECUTIVE_APPROVAL_REQUIRED",
    label: "Executive Approval Required",
    recipient: "USER",
    variables: ["stageName"],
  },
  TEAMS_MEETING_CREATION_FAILED: {
    key: "TEAMS_MEETING_CREATION_FAILED",
    label: "Microsoft Teams Creation Failure",
    recipient: "USER",
    variables: ["applicantName", "failureReason"],
  },
  NOTIFICATION_DELIVERY_FAILED: {
    key: "NOTIFICATION_DELIVERY_FAILED",
    label: "Notification Delivery Failure",
    recipient: "USER",
    variables: ["originalEvent", "failureReason"],
  },
} as const satisfies Record<string, NotificationEventDefinition>;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;

export const ALL_NOTIFICATION_EVENTS: NotificationEventDefinition[] = Object.values(NOTIFICATION_EVENTS);

export function isKnownNotificationEvent(key: string): key is NotificationEventKey {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENTS, key);
}

export function getNotificationEventDefinition(key: NotificationEventKey): NotificationEventDefinition {
  return NOTIFICATION_EVENTS[key];
}
