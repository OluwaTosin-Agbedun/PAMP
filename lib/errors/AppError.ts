/**
 * Central application error model (Phase 2, §15). Every error thrown by
 * a service/repository that should produce a specific, safe client-
 * facing message extends this. Anything else (a raw Prisma error, a
 * programming mistake) is *not* one of these, gets logged as an
 * unexpected error, and is translated to a generic message by
 * handleActionError — never surfaced with its real detail, which could
 * leak schema/internal information.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly code = "AUTHENTICATION_ERROR";
  constructor(message = "You must be signed in to do that.") {
    super(message);
  }
}

export class AuthorisationError extends AppError {
  readonly statusCode = 403;
  readonly code = "AUTHORISATION_ERROR";
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export class AccountInactiveError extends AppError {
  readonly statusCode = 403;
  readonly code = "ACCOUNT_INACTIVE";
  constructor(message = "This account is not active. Contact your System Administrator.") {
    super(message);
  }
}

export class AccountLockedError extends AppError {
  readonly statusCode = 403;
  readonly code = "ACCOUNT_LOCKED";
  constructor(message = "This account is locked. Contact your System Administrator.") {
    super(message);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = "VALIDATION_ERROR";
  constructor(message = "Some of the information provided isn't valid.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "That record couldn't be found.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
  constructor(message = "That conflicts with an existing record.") {
    super(message);
  }
}

export class InternalApplicationError extends AppError {
  readonly statusCode = 500;
  readonly code = "INTERNAL_ERROR";
  constructor(message = "Something went wrong. Please try again.") {
    super(message);
  }
}

/**
 * Review framework / scoring domain errors (Phase 3A §23). Kept in this
 * same file, not a separate module — one error hierarchy, not one per
 * domain, so `handleActionError` and every `instanceof AppError` check
 * keep working unchanged for these too.
 */
export class InvalidReviewFrameworkError extends AppError {
  readonly statusCode = 422;
  readonly code = "INVALID_REVIEW_FRAMEWORK";
  constructor(message = "This framework isn't valid and can't be published.") {
    super(message);
  }
}

export class FrameworkNotPublishedError extends AppError {
  readonly statusCode = 409;
  readonly code = "FRAMEWORK_NOT_PUBLISHED";
  constructor(message = "This review stage has no published framework yet.") {
    super(message);
  }
}

export class FrameworkLockedError extends AppError {
  readonly statusCode = 409;
  readonly code = "FRAMEWORK_LOCKED";
  constructor(message = "A published or retired framework can't be modified — create a new version instead.") {
    super(message);
  }
}

export class InvalidScoreError extends AppError {
  readonly statusCode = 422;
  readonly code = "INVALID_SCORE";
  constructor(message = "One or more scores aren't valid for this review.") {
    super(message);
  }
}

export class IncompleteReviewError extends AppError {
  readonly statusCode = 422;
  readonly code = "INCOMPLETE_REVIEW";
  constructor(message = "This review is missing required scores or comments and can't be submitted.") {
    super(message);
  }
}

export class ReviewAlreadySubmittedError extends AppError {
  readonly statusCode = 409;
  readonly code = "REVIEW_ALREADY_SUBMITTED";
  constructor(message = "This review has already been submitted.") {
    super(message);
  }
}

/**
 * Covers both the Review lifecycle (Phase 3A) and the ReviewAssignment
 * lifecycle (Phase 3B, modules/reviews/domain/assignmentLifecycle.ts) —
 * renamed from the Phase 3A-only `InvalidReviewTransitionError` when
 * Phase 3B needed the identical "one transition table, reject anything
 * not in it" pattern for a second entity. Refactored in place rather
 * than adding a duplicate `InvalidAssignmentTransitionError` class, per
 * the standing instruction to change an earlier implementation instead
 * of duplicating it.
 */
export class InvalidStatusTransitionError extends AppError {
  readonly statusCode = 409;
  readonly code = "INVALID_STATUS_TRANSITION";
  constructor(message = "That status change isn't allowed.") {
    super(message);
  }
}

export class ReviewPeriodClosedError extends AppError {
  readonly statusCode = 409;
  readonly code = "REVIEW_PERIOD_CLOSED";
  constructor(message = "This review stage is not currently open.") {
    super(message);
  }
}

export class DuplicateCriterionScoreError extends AppError {
  readonly statusCode = 409;
  readonly code = "DUPLICATE_CRITERION_SCORE";
  constructor(message = "Each criterion can only be scored once per review.") {
    super(message);
  }
}

export class ReviewConcurrencyError extends AppError {
  readonly statusCode = 409;
  readonly code = "REVIEW_CONCURRENCY_CONFLICT";
  constructor(message = "This review changed elsewhere — refresh and try again.") {
    super(message);
  }
}

/**
 * Review assignment engine errors (Phase 3B §13/§9/§10).
 */
export class ConflictOfInterestError extends AppError {
  readonly statusCode = 409;
  readonly code = "CONFLICT_OF_INTEREST";
  constructor(message = "This reviewer has a recorded conflict of interest with this application.") {
    super(message);
  }
}

export class ReviewerAtCapacityError extends AppError {
  readonly statusCode = 409;
  readonly code = "REVIEWER_AT_CAPACITY";
  constructor(message = "This reviewer is already at their maximum concurrent assignments.") {
    super(message);
  }
}

export class ReviewerUnavailableError extends AppError {
  readonly statusCode = 409;
  readonly code = "REVIEWER_UNAVAILABLE";
  constructor(message = "This reviewer is currently marked unavailable.") {
    super(message);
  }
}

export class NoEligibleReviewersError extends AppError {
  readonly statusCode = 409;
  readonly code = "NO_ELIGIBLE_REVIEWERS";
  constructor(message = "No eligible reviewers are available for this assignment.") {
    super(message);
  }
}

export class SelfAssignmentError extends AppError {
  readonly statusCode = 403;
  readonly code = "SELF_ASSIGNMENT";
  constructor(message = "You cannot assign a review to yourself.") {
    super(message);
  }
}

export class DuplicateAssignmentError extends AppError {
  readonly statusCode = 409;
  readonly code = "DUPLICATE_ASSIGNMENT";
  constructor(message = "This reviewer is already assigned to this application.") {
    super(message);
  }
}

export class ThirdReviewAlreadyExistsError extends AppError {
  readonly statusCode = 409;
  readonly code = "THIRD_REVIEW_ALREADY_EXISTS";
  constructor(message = "A third review has already been assigned for this application.") {
    super(message);
  }
}

/**
 * Interview Scoring Revision (Addendum Module 2, §2.5–§2.6).
 */
export class InsufficientSubmissionsError extends AppError {
  readonly statusCode = 422;
  readonly code = "INSUFFICIENT_SUBMISSIONS";
  constructor(message = "At least three panellists must submit before this interview's score can be finalized.") {
    super(message);
  }
}

export class InterviewScoringClosedError extends AppError {
  readonly statusCode = 409;
  readonly code = "INTERVIEW_SCORING_CLOSED";
  constructor(message = "This interview's scoring has been closed and can no longer be changed.") {
    super(message);
  }
}

/**
 * Microsoft Teams Interview Integration. `GraphNotConfiguredError` is
 * the expected state for any environment without Microsoft Graph
 * credentials set (e.g. local dev) — distinguishable from a genuine
 * sync failure so the UI can say "not configured" rather than "failed."
 * `TeamsMeetingSyncError` is a real attempted-and-failed sync (network
 * error, Graph rejected the request, etc.) — always thrown after the
 * failure is persisted to `InterviewTeamsMeeting`, never swallowed, so
 * a sync failure can never be mistaken for success by its caller.
 */
export class GraphNotConfiguredError extends AppError {
  readonly statusCode = 409;
  readonly code = "GRAPH_NOT_CONFIGURED";
  constructor(message = "Microsoft Teams integration isn't configured in this environment.") {
    super(message);
  }
}

export class TeamsMeetingSyncError extends AppError {
  readonly statusCode = 502;
  readonly code = "TEAMS_MEETING_SYNC_FAILED";
  constructor(message = "Couldn't sync this interview with Microsoft Teams. You can retry, or enter a meeting link manually.") {
    super(message);
  }
}

/**
 * Notification Infrastructure — the outbound-email counterpart of
 * `TeamsMeetingSyncError`: a real attempted-and-failed send (network
 * error, Graph rejected the request, invalid recipient address). Always
 * thrown after the failure is persisted to `OutboundNotification`, never
 * swallowed — a send failure can never be mistaken for success by its
 * caller. `GraphNotConfiguredError` (above) is reused for the "Graph
 * mail isn't configured" state rather than a separate class, since it's
 * the same underlying condition as the Teams one, just a different
 * message.
 */
export class NotificationSendError extends AppError {
  readonly statusCode = 502;
  readonly code = "NOTIFICATION_SEND_FAILED";
  constructor(message = "Couldn't send this notification.") {
    super(message);
  }
}
