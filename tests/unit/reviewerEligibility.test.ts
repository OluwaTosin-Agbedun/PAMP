import { describe, expect, it } from "vitest";

import { filterEligibleReviewers, type ReviewerCandidateSnapshot } from "@/modules/reviews/domain/reviewerEligibility";

function candidate(overrides: Partial<ReviewerCandidateSnapshot> & { reviewerId: string }): ReviewerCandidateSnapshot {
  return {
    isActiveReviewerAccount: true,
    isAvailable: true,
    activeAssignmentCount: 0,
    maxConcurrentAssignments: 10,
    hasConflictOfInterest: false,
    alreadyAssignedToThisApplication: false,
    ...overrides,
  };
}

describe("filterEligibleReviewers", () => {
  it("excludes the requesting actor from their own candidate pool (no self-assignment)", () => {
    const { eligible, excluded } = filterEligibleReviewers([candidate({ reviewerId: "actor" })], "actor");
    expect(eligible).toHaveLength(0);
    expect(excluded).toEqual([{ reviewerId: "actor", reason: "SELF_ASSIGNMENT" }]);
  });

  it("does not exclude anyone for self-assignment when there is no requesting actor (system-triggered)", () => {
    const { eligible } = filterEligibleReviewers([candidate({ reviewerId: "r1" })], null);
    expect(eligible).toHaveLength(1);
  });

  it("excludes an inactive account", () => {
    const { excluded } = filterEligibleReviewers([candidate({ reviewerId: "r1", isActiveReviewerAccount: false })], null);
    expect(excluded).toEqual([{ reviewerId: "r1", reason: "INACTIVE_ACCOUNT" }]);
  });

  it("excludes an unavailable reviewer", () => {
    const { excluded } = filterEligibleReviewers([candidate({ reviewerId: "r1", isAvailable: false })], null);
    expect(excluded).toEqual([{ reviewerId: "r1", reason: "UNAVAILABLE" }]);
  });

  it("excludes a reviewer at capacity", () => {
    const { excluded } = filterEligibleReviewers(
      [candidate({ reviewerId: "r1", activeAssignmentCount: 5, maxConcurrentAssignments: 5 })],
      null,
    );
    expect(excluded).toEqual([{ reviewerId: "r1", reason: "AT_CAPACITY" }]);
  });

  it("excludes a reviewer with a conflict of interest", () => {
    const { excluded } = filterEligibleReviewers([candidate({ reviewerId: "r1", hasConflictOfInterest: true })], null);
    expect(excluded).toEqual([{ reviewerId: "r1", reason: "CONFLICT_OF_INTEREST" }]);
  });

  it("excludes a reviewer already assigned to this application (never review the same application twice)", () => {
    const { excluded } = filterEligibleReviewers(
      [candidate({ reviewerId: "r1", alreadyAssignedToThisApplication: true })],
      null,
    );
    expect(excluded).toEqual([{ reviewerId: "r1", reason: "ALREADY_ASSIGNED_TO_APPLICATION" }]);
  });

  it("checks exclusion reasons in a fixed priority order (self-assignment first)", () => {
    const { excluded } = filterEligibleReviewers(
      [candidate({ reviewerId: "actor", isActiveReviewerAccount: false, hasConflictOfInterest: true })],
      "actor",
    );
    expect(excluded).toEqual([{ reviewerId: "actor", reason: "SELF_ASSIGNMENT" }]);
  });

  it("keeps an eligible reviewer in the eligible list, unmodified", () => {
    const snapshot = candidate({ reviewerId: "r1" });
    const { eligible, excluded } = filterEligibleReviewers([snapshot], null);
    expect(eligible).toEqual([snapshot]);
    expect(excluded).toHaveLength(0);
  });
});
