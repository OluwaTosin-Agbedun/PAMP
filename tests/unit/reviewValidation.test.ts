import { describe, expect, it } from "vitest";

import { Prisma } from "@/lib/generated/prisma/client";
import { validateCriterionScore, validateReviewScores } from "@/modules/reviews/domain/validation";
import type { CriterionWithScale } from "@/modules/reviews/types/scoring";

function makeCriterion(overrides: Partial<CriterionWithScale> = {}): CriterionWithScale {
  return {
    id: "c1",
    reviewFrameworkId: "f1",
    code: "C1",
    label: "Criterion 1",
    description: null,
    reviewerGuidance: null,
    evidenceGuidance: null,
    displayOrder: 0,
    minScore: new Prisma.Decimal(0),
    maxScore: new Prisma.Decimal(10),
    weight: new Prisma.Decimal(1),
    isMandatory: true,
    isCommentMandatory: false,
    allowDecimalScores: true,
    isActive: true,
    ratingScaleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ratingScale: null,
    ...overrides,
  };
}

describe("validateCriterionScore", () => {
  it("accepts a score within range", () => {
    expect(validateCriterionScore(makeCriterion(), { criterionId: "c1", score: "7" }, { mode: "draft" })).toEqual([]);
  });

  it("rejects a non-numeric score", () => {
    const issues = validateCriterionScore(makeCriterion(), { criterionId: "c1", score: "not-a-number" }, { mode: "draft" });
    expect(issues.map((i) => i.code)).toContain("INVALID_SCORE_TYPE");
  });

  it("rejects a score below the criterion's minimum", () => {
    const criterion = makeCriterion({ minScore: new Prisma.Decimal(5) });
    const issues = validateCriterionScore(criterion, { criterionId: "c1", score: "4" }, { mode: "draft" });
    expect(issues.map((i) => i.code)).toContain("SCORE_OUT_OF_RANGE");
  });

  it("rejects a score above the criterion's maximum", () => {
    const issues = validateCriterionScore(makeCriterion(), { criterionId: "c1", score: "10.5" }, { mode: "draft" });
    expect(issues.map((i) => i.code)).toContain("SCORE_OUT_OF_RANGE");
  });

  it("rejects a decimal score when the criterion only allows whole numbers", () => {
    const criterion = makeCriterion({ allowDecimalScores: false });
    const issues = validateCriterionScore(criterion, { criterionId: "c1", score: "7.5" }, { mode: "draft" });
    expect(issues.map((i) => i.code)).toContain("DECIMAL_NOT_ALLOWED");
  });

  it("accepts a whole-number score when decimals are disallowed", () => {
    const criterion = makeCriterion({ allowDecimalScores: false });
    expect(validateCriterionScore(criterion, { criterionId: "c1", score: "7" }, { mode: "draft" })).toEqual([]);
  });

  it("rejects a score that doesn't match any rating scale band", () => {
    const criterion = makeCriterion({
      ratingScaleId: "scale1",
      ratingScale: { bands: [{ value: new Prisma.Decimal(2) }, { value: new Prisma.Decimal(4) }] as never },
    });
    const issues = validateCriterionScore(criterion, { criterionId: "c1", score: "3" }, { mode: "draft" });
    expect(issues.map((i) => i.code)).toContain("SCORE_NOT_ON_SCALE");
  });

  it("accepts a score that matches a rating scale band exactly", () => {
    const criterion = makeCriterion({
      ratingScaleId: "scale1",
      ratingScale: { bands: [{ value: new Prisma.Decimal(2) }, { value: new Prisma.Decimal(4) }] as never },
    });
    expect(validateCriterionScore(criterion, { criterionId: "c1", score: "4" }, { mode: "draft" })).toEqual([]);
  });

  it("requires a comment only in submit mode when the criterion mandates one", () => {
    const criterion = makeCriterion({ isCommentMandatory: true });
    const draftIssues = validateCriterionScore(criterion, { criterionId: "c1", score: "5" }, { mode: "draft" });
    expect(draftIssues.map((i) => i.code)).not.toContain("COMMENT_REQUIRED");

    const submitIssues = validateCriterionScore(criterion, { criterionId: "c1", score: "5" }, { mode: "submit" });
    expect(submitIssues.map((i) => i.code)).toContain("COMMENT_REQUIRED");

    const withComment = validateCriterionScore(criterion, { criterionId: "c1", score: "5", comment: "Solid" }, { mode: "submit" });
    expect(withComment.map((i) => i.code)).not.toContain("COMMENT_REQUIRED");
  });
});

describe("validateReviewScores", () => {
  const criteria = [makeCriterion({ id: "a", code: "A" }), makeCriterion({ id: "b", code: "B" })];

  it("draft mode allows missing criteria and missing optional comments", () => {
    const result = validateReviewScores(criteria, [{ criterionId: "a", score: "5" }], {
      mode: "draft",
      allCriteriaMandatory: true,
    });
    expect(result.valid).toBe(true);
  });

  it("draft mode still rejects an out-of-range score", () => {
    const result = validateReviewScores(criteria, [{ criterionId: "a", score: "999" }], {
      mode: "draft",
      allCriteriaMandatory: true,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("SCORE_OUT_OF_RANGE");
  });

  it("rejects a criterion ID that doesn't belong to this framework", () => {
    const result = validateReviewScores(criteria, [{ criterionId: "does-not-exist", score: "5" }], {
      mode: "draft",
      allCriteriaMandatory: true,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("UNKNOWN_CRITERION");
  });

  it("rejects duplicate scores for the same criterion in one call", () => {
    const result = validateReviewScores(
      criteria,
      [
        { criterionId: "a", score: "5" },
        { criterionId: "a", score: "6" },
      ],
      { mode: "draft", allCriteriaMandatory: true },
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("DUPLICATE_CRITERION_SCORE");
  });

  it("rejects an inactive criterion", () => {
    const withInactive = [makeCriterion({ id: "a", code: "A" }), makeCriterion({ id: "b", code: "B", isActive: false })];
    const result = validateReviewScores(withInactive, [{ criterionId: "b", score: "5" }], {
      mode: "draft",
      allCriteriaMandatory: true,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("CRITERION_INACTIVE");
  });

  it("submit mode requires every mandatory criterion to have a score", () => {
    const result = validateReviewScores(criteria, [{ criterionId: "a", score: "5" }], {
      mode: "submit",
      allCriteriaMandatory: true,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.some((i) => i.code === "MISSING_MANDATORY_SCORE" && i.criterionId === "b")).toBe(true);
    }
  });

  it("submit mode succeeds once every mandatory criterion is scored", () => {
    const result = validateReviewScores(
      criteria,
      [
        { criterionId: "a", score: "5" },
        { criterionId: "b", score: "6" },
      ],
      { mode: "submit", allCriteriaMandatory: true },
    );
    expect(result.valid).toBe(true);
  });

  it("allCriteriaMandatory=false falls back to each criterion's own isMandatory flag", () => {
    const mixed = [
      makeCriterion({ id: "a", code: "A", isMandatory: true }),
      makeCriterion({ id: "b", code: "B", isMandatory: false }),
    ];
    const result = validateReviewScores(mixed, [{ criterionId: "a", score: "5" }], {
      mode: "submit",
      allCriteriaMandatory: false,
    });
    expect(result.valid).toBe(true);
  });

  it("requires the overall comment at submission when the stage mandates one", () => {
    const result = validateReviewScores(
      criteria,
      [
        { criterionId: "a", score: "5" },
        { criterionId: "b", score: "6" },
      ],
      { mode: "submit", allCriteriaMandatory: true, overallCommentRequired: true, overallComment: "" },
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("OVERALL_COMMENT_REQUIRED");
  });
});
