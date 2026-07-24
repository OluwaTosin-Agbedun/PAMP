import { describe, expect, it } from "vitest";

import { Prisma } from "@/lib/generated/prisma/client";
import { validateInterviewScores } from "@/modules/interviews/domain/interviewScoreValidation";

function criterion(overrides: Partial<{ id: string; maxScore: string; isActive: boolean; label: string }>) {
  return {
    id: overrides.id ?? "c1",
    cohortId: "cohort-1",
    label: overrides.label ?? "Question 1",
    description: null,
    maxScore: new Prisma.Decimal(overrides.maxScore ?? "10"),
    weight: new Prisma.Decimal("1"),
    order: 0,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;
}

describe("validateInterviewScores — draft mode", () => {
  it("accepts a partial, empty set of entries", () => {
    const result = validateInterviewScores([criterion({})], [], { mode: "draft" });
    expect(result.valid).toBe(true);
  });

  it("rejects a score outside [0, maxScore]", () => {
    const result = validateInterviewScores([criterion({ maxScore: "10" })], [{ criterionId: "c1", score: "11" }], { mode: "draft" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0].code).toBe("SCORE_OUT_OF_RANGE");
  });

  it("rejects a negative score", () => {
    const result = validateInterviewScores([criterion({})], [{ criterionId: "c1", score: "-1" }], { mode: "draft" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0].code).toBe("SCORE_OUT_OF_RANGE");
  });

  it("rejects a non-numeric score", () => {
    const result = validateInterviewScores([criterion({})], [{ criterionId: "c1", score: "not-a-number" }], { mode: "draft" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0].code).toBe("INVALID_SCORE_TYPE");
  });

  it("rejects an unknown criterionId", () => {
    const result = validateInterviewScores([criterion({ id: "c1" })], [{ criterionId: "does-not-exist", score: "5" }], { mode: "draft" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0].code).toBe("UNKNOWN_CRITERION");
  });

  it("rejects an inactive criterion", () => {
    const result = validateInterviewScores([criterion({ id: "c1", isActive: false })], [{ criterionId: "c1", score: "5" }], { mode: "draft" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0].code).toBe("CRITERION_INACTIVE");
  });

  it("rejects a duplicate criterion entry", () => {
    const result = validateInterviewScores(
      [criterion({ id: "c1" })],
      [
        { criterionId: "c1", score: "5" },
        { criterionId: "c1", score: "7" },
      ],
      { mode: "draft" },
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.some((i) => i.code === "DUPLICATE_CRITERION_SCORE")).toBe(true);
  });
});

describe("validateInterviewScores — submit mode", () => {
  it("rejects submission with zero scored entries", () => {
    const result = validateInterviewScores([criterion({})], [], { mode: "submit" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0].code).toBe("NO_SCORES_ENTERED");
  });

  it("accepts submission with at least one valid scored entry, even if not every criterion is scored", () => {
    const criteria = [criterion({ id: "a" }), criterion({ id: "b" })];
    const result = validateInterviewScores(criteria, [{ criterionId: "a", score: "5" }], { mode: "submit" });
    expect(result.valid).toBe(true);
  });
});
