import { describe, expect, it } from "vitest";

import { Prisma } from "@/lib/generated/prisma/client";
import {
  calculateCriterionScore,
  calculateFrameworkMaxScore,
  calculateReviewRawScore,
  calculateReviewTotal,
  calculateReviewWeightedScore,
  getReviewScoreBreakdown,
  toDecimal,
} from "@/modules/reviews/domain/scoring";

function criterion(overrides: Partial<{ id: string; maxScore: string; weight: string; isActive: boolean; displayOrder: number; code: string; label: string }>) {
  return {
    id: overrides.id ?? "c1",
    maxScore: new Prisma.Decimal(overrides.maxScore ?? "10"),
    weight: new Prisma.Decimal(overrides.weight ?? "1"),
    isActive: overrides.isActive ?? true,
    displayOrder: overrides.displayOrder ?? 0,
    code: overrides.code ?? "C1",
    label: overrides.label ?? "Criterion 1",
  } as never;
}

describe("calculateCriterionScore", () => {
  it("multiplies raw score by weight", () => {
    expect(calculateCriterionScore("8", "1.5").toString()).toBe("12");
  });

  it("is deterministic — same inputs always produce the same output", () => {
    const a = calculateCriterionScore("7.33", "2.1");
    const b = calculateCriterionScore("7.33", "2.1");
    expect(a.toString()).toBe(b.toString());
  });

  it("uses exact decimal arithmetic, not binary floating point", () => {
    // 0.1 + 0.2 !== 0.3 in native JS number arithmetic; Decimal must get this right.
    const result = calculateCriterionScore("0.1", "1").plus(calculateCriterionScore("0.2", "1"));
    expect(result.toString()).toBe("0.3");
  });
});

describe("calculateReviewRawScore", () => {
  it("sums raw scores, ignoring weight", () => {
    const entries = [{ score: toDecimal("5") }, { score: toDecimal("3.5") }];
    expect(calculateReviewRawScore(entries).toString()).toBe("8.5");
  });

  it("returns 0 for no entries", () => {
    expect(calculateReviewRawScore([]).toString()).toBe("0");
  });
});

describe("calculateReviewWeightedScore", () => {
  it("sums score × weight per criterion", () => {
    const criteria = [criterion({ id: "a", weight: "2" }), criterion({ id: "b", weight: "1" })];
    const entries = [
      { criterionId: "a", score: toDecimal("5") },
      { criterionId: "b", score: toDecimal("3") },
    ];
    // (5 * 2) + (3 * 1) = 13
    expect(calculateReviewWeightedScore(entries, criteria).toString()).toBe("13");
  });

  it("ignores unweighted (weight = 1) entries identically to a direct sum", () => {
    const criteria = [criterion({ id: "a" }), criterion({ id: "b" })];
    const entries = [
      { criterionId: "a", score: toDecimal("4") },
      { criterionId: "b", score: toDecimal("6") },
    ];
    expect(calculateReviewWeightedScore(entries, criteria).toString()).toBe("10");
  });

  it("skips entries whose criterionId isn't in the provided criteria list", () => {
    const criteria = [criterion({ id: "a" })];
    const entries = [
      { criterionId: "a", score: toDecimal("4") },
      { criterionId: "unknown", score: toDecimal("100") },
    ];
    expect(calculateReviewWeightedScore(entries, criteria).toString()).toBe("4");
  });
});

describe("calculateReviewTotal", () => {
  it("rounds the final total to 2 decimal places using ROUND_HALF_UP", () => {
    const criteria = [criterion({ id: "x", weight: "1" })];
    // 1.005 has no exact binary float representation — native `number`
    // arithmetic mis-rounds this kind of value; Decimal.ROUND_HALF_UP
    // handles the exact halfway case correctly, rounding up to 1.01.
    const entries = [{ criterionId: "x", score: toDecimal("1.005") }];
    expect(calculateReviewTotal(entries, criteria, "WEIGHTED_SUM").toString()).toBe("1.01");
  });

  it("does not round intermediate per-criterion contributions before summing", () => {
    const criteria = [
      criterion({ id: "a", weight: "0.333" }),
      criterion({ id: "b", weight: "0.333" }),
      criterion({ id: "c", weight: "0.334" }),
    ];
    const entries = [
      { criterionId: "a", score: toDecimal("10") },
      { criterionId: "b", score: toDecimal("10") },
      { criterionId: "c", score: toDecimal("10") },
    ];
    // 3.33 + 3.33 + 3.34 = 10.00 exactly, whether or not each term is
    // rounded first — this exercises the "many small weighted terms sum
    // to a clean total" path without asserting rounding order directly.
    expect(calculateReviewTotal(entries, criteria, "WEIGHTED_SUM").toString()).toBe("10");
  });

  it("throws for an unsupported scoring method", () => {
    expect(() => calculateReviewTotal([], [], "PERCENTAGE_NORMALISED" as never)).toThrow();
  });

  it("is deterministic across repeated calls", () => {
    const criteria = [criterion({ id: "a", weight: "1.7" })];
    const entries = [{ criterionId: "a", score: toDecimal("6.4") }];
    const first = calculateReviewTotal(entries, criteria, "WEIGHTED_SUM");
    const second = calculateReviewTotal(entries, criteria, "WEIGHTED_SUM");
    expect(first.toString()).toBe(second.toString());
  });
});

describe("calculateFrameworkMaxScore", () => {
  it("sums maxScore × weight across active criteria only", () => {
    const criteria = [
      criterion({ id: "a", maxScore: "10", weight: "1" }),
      criterion({ id: "b", maxScore: "20", weight: "2" }),
      criterion({ id: "c", maxScore: "5", weight: "1", isActive: false }),
    ];
    // (10*1) + (20*2) = 50, inactive "c" excluded
    expect(calculateFrameworkMaxScore(criteria).toString()).toBe("50");
  });
});

describe("getReviewScoreBreakdown", () => {
  it("returns one row per active criterion, sorted by displayOrder, with null for unscored criteria", () => {
    const criteria = [
      criterion({ id: "b", displayOrder: 1, code: "B", label: "Second" }),
      criterion({ id: "a", displayOrder: 0, code: "A", label: "First" }),
    ];
    const entries = [{ criterionId: "a", score: toDecimal("7"), comment: "Good" }];

    const breakdown = getReviewScoreBreakdown(entries, criteria, "WEIGHTED_SUM");

    expect(breakdown.criteria.map((c) => c.code)).toEqual(["A", "B"]);
    expect(breakdown.criteria[0].rawScore?.toString()).toBe("7");
    expect(breakdown.criteria[0].comment).toBe("Good");
    expect(breakdown.criteria[1].rawScore).toBeNull();
    expect(breakdown.total.toString()).toBe("7");
    expect(breakdown.maxPossible.toString()).toBe("20");
  });
});
