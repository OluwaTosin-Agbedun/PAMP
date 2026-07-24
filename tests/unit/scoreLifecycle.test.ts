import { describe, expect, it } from "vitest";

import { InvalidStatusTransitionError } from "@/lib/errors";
import { assertScoreTransition, canTransitionScore } from "@/modules/interviews/domain/scoreLifecycle";

describe("scoreLifecycle", () => {
  it("allows DRAFT to move to SUBMITTED or RECUSED", () => {
    expect(canTransitionScore("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionScore("DRAFT", "RECUSED")).toBe(true);
  });

  it("treats SUBMITTED and RECUSED as terminal", () => {
    expect(canTransitionScore("SUBMITTED", "DRAFT")).toBe(false);
    expect(canTransitionScore("RECUSED", "DRAFT")).toBe(false);
    expect(canTransitionScore("SUBMITTED", "RECUSED")).toBe(false);
  });

  it("assertScoreTransition throws InvalidStatusTransitionError for an illegal move", () => {
    expect(() => assertScoreTransition("SUBMITTED", "DRAFT")).toThrow(InvalidStatusTransitionError);
  });

  it("assertScoreTransition is a no-op for a legal move", () => {
    expect(() => assertScoreTransition("DRAFT", "SUBMITTED")).not.toThrow();
  });
});
