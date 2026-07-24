import { describe, expect, it } from "vitest";

import { evaluateFiveYearRule } from "@/modules/eligibility/fiveYearRule";

describe("evaluateFiveYearRule", () => {
  it("is satisfied for someone currently serving, regardless of dates", () => {
    expect(evaluateFiveYearRule("CURRENTLY_SERVING", null).outcome).toBe("SATISFIED");
  });

  it("needs screener input for exemption/exclusion — no date to calculate from", () => {
    expect(evaluateFiveYearRule("EXEMPTED", null).outcome).toBe("NEEDS_SCREENER_INPUT");
    expect(evaluateFiveYearRule("EXCLUDED", null).outcome).toBe("NEEDS_SCREENER_INPUT");
  });

  it("needs screener input when NYSC status was never recorded", () => {
    expect(evaluateFiveYearRule("NOT_RECORDED", null).outcome).toBe("NEEDS_SCREENER_INPUT");
  });

  it("needs screener input when completed but no completion date is on record", () => {
    expect(evaluateFiveYearRule("COMPLETED", null).outcome).toBe("NEEDS_SCREENER_INPUT");
  });

  it("is satisfied exactly at the five-year boundary", () => {
    const completion = new Date("2020-01-15");
    const asOf = new Date("2025-01-15"); // exactly 5 years later
    expect(evaluateFiveYearRule("COMPLETED", completion, asOf).outcome).toBe("SATISFIED");
  });

  it("is exceeded the day after the five-year boundary", () => {
    const completion = new Date("2020-01-15");
    const asOf = new Date("2025-01-16");
    expect(evaluateFiveYearRule("COMPLETED", completion, asOf).outcome).toBe("EXCEEDED");
  });

  it("uses an exact date calculation, not a loose year-difference (December completion, ~5.5 years later)", () => {
    // Completed December 2019; "asOf" mid-2025 is only a 5-year *calendar
    // year* gap by naive subtraction (2025-2019=6, or 2025-2020=5
    // depending on rounding), but the exact date is well past 5 years.
    const completion = new Date("2019-12-01");
    const asOf = new Date("2025-06-01");
    expect(evaluateFiveYearRule("COMPLETED", completion, asOf).outcome).toBe("EXCEEDED");
  });

  it("is satisfied well within five years", () => {
    const completion = new Date("2023-01-01");
    const asOf = new Date("2026-01-01");
    expect(evaluateFiveYearRule("COMPLETED", completion, asOf).outcome).toBe("SATISFIED");
  });
});
