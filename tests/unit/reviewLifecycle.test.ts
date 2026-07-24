import { describe, expect, it } from "vitest";

import type { ReviewStatus } from "@/lib/generated/prisma/client";
import { InvalidStatusTransitionError } from "@/lib/errors";
import { assertTransition, canTransition } from "@/modules/reviews/domain/lifecycle";

const ALL_STATUSES: ReviewStatus[] = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "REOPENED", "RECUSED", "CANCELLED"];

describe("review lifecycle transitions", () => {
  it.each([
    ["NOT_STARTED", "IN_PROGRESS"],
    ["NOT_STARTED", "SUBMITTED"],
    ["NOT_STARTED", "RECUSED"],
    ["NOT_STARTED", "CANCELLED"],
    ["IN_PROGRESS", "SUBMITTED"],
    ["IN_PROGRESS", "RECUSED"],
    ["IN_PROGRESS", "CANCELLED"],
    ["SUBMITTED", "REOPENED"],
    ["REOPENED", "SUBMITTED"],
    ["REOPENED", "CANCELLED"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    ["SUBMITTED", "IN_PROGRESS"],
    ["SUBMITTED", "NOT_STARTED"],
    ["SUBMITTED", "CANCELLED"],
    ["REOPENED", "IN_PROGRESS"],
    ["RECUSED", "IN_PROGRESS"],
    ["CANCELLED", "IN_PROGRESS"],
  ] as const)("forbids %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidStatusTransitionError);
  });

  it("RECUSED and CANCELLED are terminal — no outgoing transitions at all", () => {
    for (const target of ALL_STATUSES) {
      expect(canTransition("RECUSED", target)).toBe(false);
      expect(canTransition("CANCELLED", target)).toBe(false);
    }
  });

  it("no status can transition to itself (every change is a real state change)", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
