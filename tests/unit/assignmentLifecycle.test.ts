import { describe, expect, it } from "vitest";

import type { AssignmentStatus } from "@/lib/generated/prisma/client";
import { InvalidStatusTransitionError } from "@/lib/errors";
import { assertAssignmentTransition, canTransitionAssignment } from "@/modules/reviews/domain/assignmentLifecycle";

const ALL_STATUSES: AssignmentStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "ESCALATED",
  "REASSIGNED",
  "CANCELLED",
  "COMPLETED",
];

describe("assignment lifecycle transitions", () => {
  it.each([
    ["PENDING", "ASSIGNED"],
    ["ASSIGNED", "ACCEPTED"],
    ["ASSIGNED", "IN_PROGRESS"],
    ["ASSIGNED", "SUBMITTED"],
    ["ASSIGNED", "CANCELLED"],
    ["ASSIGNED", "REASSIGNED"],
    ["ACCEPTED", "IN_PROGRESS"],
    ["ACCEPTED", "SUBMITTED"],
    ["ACCEPTED", "CANCELLED"],
    ["ACCEPTED", "REASSIGNED"],
    ["IN_PROGRESS", "SUBMITTED"],
    ["IN_PROGRESS", "CANCELLED"],
    ["IN_PROGRESS", "REASSIGNED"],
    ["SUBMITTED", "ESCALATED"],
    ["SUBMITTED", "COMPLETED"],
    ["ESCALATED", "COMPLETED"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransitionAssignment(from, to)).toBe(true);
    expect(() => assertAssignmentTransition(from, to)).not.toThrow();
  });

  it.each([
    ["SUBMITTED", "REASSIGNED"],
    ["SUBMITTED", "CANCELLED"],
    ["SUBMITTED", "IN_PROGRESS"],
    ["ESCALATED", "SUBMITTED"],
    ["ESCALATED", "REASSIGNED"],
    ["COMPLETED", "ASSIGNED"],
    ["CANCELLED", "ASSIGNED"],
    ["REASSIGNED", "ASSIGNED"],
  ] as const)("forbids %s → %s", (from, to) => {
    expect(canTransitionAssignment(from, to)).toBe(false);
    expect(() => assertAssignmentTransition(from, to)).toThrow(InvalidStatusTransitionError);
  });

  it("REASSIGNED, CANCELLED and COMPLETED are terminal — no outgoing transitions at all", () => {
    for (const target of ALL_STATUSES) {
      expect(canTransitionAssignment("REASSIGNED", target)).toBe(false);
      expect(canTransitionAssignment("CANCELLED", target)).toBe(false);
      expect(canTransitionAssignment("COMPLETED", target)).toBe(false);
    }
  });

  it("no status can transition to itself", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionAssignment(status, status)).toBe(false);
    }
  });
});
