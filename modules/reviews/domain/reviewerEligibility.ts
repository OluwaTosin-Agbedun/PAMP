/**
 * The single place every "can this reviewer receive this assignment"
 * rule is checked (Phase 3B §13) — a pure function over an already-
 * loaded snapshot, so it's unit-testable without a database and reused
 * identically by both automatic assignment and manual/reassignment
 * (no second copy of these rules for the manual path).
 */
export type ReviewerCandidateSnapshot = {
  reviewerId: string;
  isActiveReviewerAccount: boolean;
  isAvailable: boolean;
  activeAssignmentCount: number;
  maxConcurrentAssignments: number;
  hasConflictOfInterest: boolean;
  alreadyAssignedToThisApplication: boolean;
};

export type ExclusionReason =
  | "INACTIVE_ACCOUNT"
  | "UNAVAILABLE"
  | "AT_CAPACITY"
  | "CONFLICT_OF_INTEREST"
  | "ALREADY_ASSIGNED_TO_APPLICATION"
  | "SELF_ASSIGNMENT";

export type EligibilityExclusion = { reviewerId: string; reason: ExclusionReason };

export type EligibilityFilterResult = {
  eligible: ReviewerCandidateSnapshot[];
  excluded: EligibilityExclusion[];
};

/**
 * `requestingActorId` — when the person initiating the assignment is
 * themself a candidate reviewer (e.g. a Reviewer somehow triggering
 * assignment), they're excluded: "no reviewer may assign work to
 * themselves" (§2). System-triggered automatic assignment passes `null`
 * here, since there's no human actor to self-assign.
 */
export function filterEligibleReviewers(
  candidates: ReviewerCandidateSnapshot[],
  requestingActorId: string | null,
): EligibilityFilterResult {
  const eligible: ReviewerCandidateSnapshot[] = [];
  const excluded: EligibilityExclusion[] = [];

  for (const candidate of candidates) {
    if (requestingActorId && candidate.reviewerId === requestingActorId) {
      excluded.push({ reviewerId: candidate.reviewerId, reason: "SELF_ASSIGNMENT" });
      continue;
    }
    if (!candidate.isActiveReviewerAccount) {
      excluded.push({ reviewerId: candidate.reviewerId, reason: "INACTIVE_ACCOUNT" });
      continue;
    }
    if (!candidate.isAvailable) {
      excluded.push({ reviewerId: candidate.reviewerId, reason: "UNAVAILABLE" });
      continue;
    }
    if (candidate.activeAssignmentCount >= candidate.maxConcurrentAssignments) {
      excluded.push({ reviewerId: candidate.reviewerId, reason: "AT_CAPACITY" });
      continue;
    }
    if (candidate.hasConflictOfInterest) {
      excluded.push({ reviewerId: candidate.reviewerId, reason: "CONFLICT_OF_INTEREST" });
      continue;
    }
    if (candidate.alreadyAssignedToThisApplication) {
      excluded.push({ reviewerId: candidate.reviewerId, reason: "ALREADY_ASSIGNED_TO_APPLICATION" });
      continue;
    }
    eligible.push(candidate);
  }

  return { eligible, excluded };
}
