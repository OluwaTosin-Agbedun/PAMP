import { describe, expect, it } from "vitest";

import { Prisma } from "@/lib/generated/prisma/client";
import { calculateInterviewMaxScore, calculateInterviewTotal, getInterviewScoreBreakdown, toDecimal } from "@/modules/interviews/domain/interviewScoring";

function criterion(overrides: Partial<{ id: string; maxScore: string; weight: string; isActive: boolean; order: number; label: string }>) {
  return {
    id: overrides.id ?? "c1",
    cohortId: "cohort-1",
    label: overrides.label ?? "Question 1",
    description: null,
    maxScore: new Prisma.Decimal(overrides.maxScore ?? "10"),
    weight: new Prisma.Decimal(overrides.weight ?? "1"),
    order: overrides.order ?? 0,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;
}

describe("calculateInterviewTotal", () => {
  it("sums score × weight per criterion, rounded to 2 decimal places", () => {
    const criteria = [criterion({ id: "a", weight: "2" }), criterion({ id: "b", weight: "1" })];
    const entries = [
      { criterionId: "a", score: toDecimal("5") },
      { criterionId: "b", score: toDecimal("3") },
    ];
    // (5 × 2) + (3 × 1) = 13
    expect(calculateInterviewTotal(entries, criteria).toString()).toBe("13");
  });

  it("is deterministic — same inputs always produce the same output", () => {
    const criteria = [criterion({ id: "a", weight: "1.5" })];
    const entries = [{ criterionId: "a", score: toDecimal("7.33") }];
    const a = calculateInterviewTotal(entries, criteria);
    const b = calculateInterviewTotal(entries, criteria);
    expect(a.toString()).toBe(b.toString());
  });

  it("ignores entries for unknown criteria rather than throwing", () => {
    const criteria = [criterion({ id: "a" })];
    const entries = [
      { criterionId: "a", score: toDecimal("5") },
      { criterionId: "unknown", score: toDecimal("100") },
    ];
    expect(calculateInterviewTotal(entries, criteria).toString()).toBe("5");
  });
});

describe("calculateInterviewMaxScore", () => {
  it("sums maxScore × weight across active criteria only", () => {
    const criteria = [
      criterion({ id: "a", maxScore: "10", weight: "2" }),
      criterion({ id: "b", maxScore: "5", weight: "1", isActive: false }),
    ];
    // Only "a" counts: 10 × 2 = 20
    expect(calculateInterviewMaxScore(criteria).toString()).toBe("20");
  });
});

describe("getInterviewScoreBreakdown", () => {
  it("returns one row per active criterion, sorted by order, with a null rawScore where unscored", () => {
    const criteria = [
      criterion({ id: "b", order: 1, label: "Second" }),
      criterion({ id: "a", order: 0, label: "First" }),
      criterion({ id: "c", order: 2, label: "Inactive", isActive: false }),
    ];
    const entries = [{ criterionId: "a", score: toDecimal("8") }];

    const breakdown = getInterviewScoreBreakdown(entries, criteria);

    expect(breakdown.criteria.map((c) => c.criterionId)).toEqual(["a", "b"]);
    expect(breakdown.criteria[0].rawScore?.toString()).toBe("8");
    expect(breakdown.criteria[1].rawScore).toBeNull();
    expect(breakdown.total.toString()).toBe("8");
    expect(breakdown.maxPossible.toString()).toBe("20");
  });
});
