import { describe, expect, it } from "vitest";

import {
  calculateDivergencePercent,
  calculateFinalScoreAfterThirdReview,
  exceedsDivergenceThreshold,
} from "@/modules/reviews/domain/thirdReviewEngine";

describe("calculateDivergencePercent", () => {
  it("is expressed in percentage points of the framework max, not raw points", () => {
    // 20-point gap on a 100-point framework is a 20 percentage-point divergence.
    expect(calculateDivergencePercent(80, 60, 100).toString()).toBe("20");
  });

  it("normalizes so the same percentage gap is equal across different framework sizes", () => {
    // 20/60 vs 15/60... but expressed as %, an equivalent-*ratio* gap should match.
    const onSixty = calculateDivergencePercent(48, 36, 60); // 80% vs 60% = 20pp
    const onHundred = calculateDivergencePercent(80, 60, 100); // 80% vs 60% = 20pp
    expect(onSixty.toString()).toBe(onHundred.toString());
  });

  it("is order-independent (absolute difference)", () => {
    expect(calculateDivergencePercent(60, 80, 100).toString()).toBe(calculateDivergencePercent(80, 60, 100).toString());
  });

  it("is zero when scores are equal", () => {
    expect(calculateDivergencePercent(50, 50, 100).toString()).toBe("0");
  });

  it("throws for a non-positive max possible score", () => {
    expect(() => calculateDivergencePercent(1, 2, 0)).toThrow();
    expect(() => calculateDivergencePercent(1, 2, -10)).toThrow();
  });
});

describe("exceedsDivergenceThreshold", () => {
  it("is false when divergence equals the threshold exactly (strictly greater-than)", () => {
    expect(exceedsDivergenceThreshold(calculateDivergencePercent(63, 50, 100), "13")).toBe(false);
  });

  it("is true just over the threshold", () => {
    expect(exceedsDivergenceThreshold(calculateDivergencePercent(63.01, 50, 100), "13")).toBe(true);
  });

  it("is false comfortably under the threshold", () => {
    expect(exceedsDivergenceThreshold(calculateDivergencePercent(55, 50, 100), "13")).toBe(false);
  });
});

describe("calculateFinalScoreAfterThirdReview", () => {
  it("averages the third reviewer's score with the LOWER of the first two (§2's formula)", () => {
    // lower(80, 60) = 60; avg(60, 90) = 75
    expect(calculateFinalScoreAfterThirdReview(80, 60, 90).toString()).toBe("75");
  });

  it("picks the lower score regardless of argument order", () => {
    expect(calculateFinalScoreAfterThirdReview(60, 80, 90).toString()).toBe(
      calculateFinalScoreAfterThirdReview(80, 60, 90).toString(),
    );
  });

  it("rounds once, at the end, to the configured decimal places", () => {
    // lower(10, 11) = 10; avg(10, 11) = 10.5
    expect(calculateFinalScoreAfterThirdReview(10, 11, 11).toString()).toBe("10.5");
  });
});
