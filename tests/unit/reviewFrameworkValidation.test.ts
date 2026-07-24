import { describe, expect, it } from "vitest";

import { Prisma } from "@/lib/generated/prisma/client";
import { validateFrameworkForPublish } from "@/modules/reviews/domain/frameworkValidation";

function makeStage(overrides: Partial<{ maxTotalScore: string; programmeId: string; cohortId: string | null }> = {}) {
  return {
    id: "stage1",
    programmeId: overrides.programmeId ?? "prog1",
    cohortId: overrides.cohortId ?? null,
    maxTotalScore: new Prisma.Decimal(overrides.maxTotalScore ?? "10"),
  } as never;
}

function makeFramework(overrides: Partial<{ status: string; programmeId: string; cohortId: string | null }> = {}) {
  return {
    id: "fw1",
    reviewStageId: "stage1",
    programmeId: overrides.programmeId ?? "prog1",
    cohortId: overrides.cohortId ?? null,
    status: overrides.status ?? "DRAFT",
  } as never;
}

function makeCriterion(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "c1",
    code: overrides.code ?? "C1",
    label: overrides.label ?? "Criterion 1",
    displayOrder: overrides.displayOrder ?? 0,
    minScore: new Prisma.Decimal((overrides.minScore as string) ?? "0"),
    maxScore: new Prisma.Decimal((overrides.maxScore as string) ?? "10"),
    weight: new Prisma.Decimal((overrides.weight as string) ?? "1"),
    isMandatory: overrides.isMandatory ?? true,
    isActive: overrides.isActive ?? true,
    reviewerGuidance: overrides.reviewerGuidance ?? "Guidance text.",
    ratingScaleId: overrides.ratingScaleId ?? null,
    ...overrides,
  } as never;
}

describe("validateFrameworkForPublish", () => {
  it("accepts a well-formed framework whose configured total matches the stage maximum", () => {
    const result = validateFrameworkForPublish(makeFramework(), makeStage({ maxTotalScore: "10" }), [makeCriterion()], []);
    expect(result.valid).toBe(true);
  });

  it("rejects a framework that isn't in DRAFT status", () => {
    const result = validateFrameworkForPublish(
      makeFramework({ status: "PUBLISHED" }),
      makeStage(),
      [makeCriterion()],
      [],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("FRAMEWORK_NOT_DRAFT");
  });

  it("rejects a framework with zero active criteria", () => {
    const result = validateFrameworkForPublish(makeFramework(), makeStage(), [makeCriterion({ isActive: false })], []);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("NO_ACTIVE_CRITERIA");
  });

  it("rejects duplicate criterion codes", () => {
    const result = validateFrameworkForPublish(
      makeFramework(),
      makeStage({ maxTotalScore: "20" }),
      [makeCriterion({ id: "a", code: "DUP", maxScore: "10" }), makeCriterion({ id: "b", code: "DUP", maxScore: "10" })],
      [],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("DUPLICATE_CRITERION_CODE");
  });

  it("rejects a criterion whose minimum exceeds its maximum", () => {
    const result = validateFrameworkForPublish(
      makeFramework(),
      makeStage(),
      [makeCriterion({ minScore: "8", maxScore: "5" })],
      [],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("MIN_EXCEEDS_MAX");
  });

  it("rejects a non-positive maximum score", () => {
    const result = validateFrameworkForPublish(makeFramework(), makeStage(), [makeCriterion({ maxScore: "0" })], []);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("MAX_SCORE_NOT_POSITIVE");
  });

  it("rejects a non-positive weight", () => {
    const result = validateFrameworkForPublish(makeFramework(), makeStage(), [makeCriterion({ weight: "0" })], []);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("INVALID_WEIGHT");
  });

  it("rejects a mandatory criterion with no reviewer guidance", () => {
    const result = validateFrameworkForPublish(
      makeFramework(),
      makeStage(),
      [makeCriterion({ isMandatory: true, reviewerGuidance: "" })],
      [],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("MISSING_REVIEWER_GUIDANCE");
  });

  it("rejects a criterion referencing a rating scale with no bands", () => {
    const result = validateFrameworkForPublish(
      makeFramework(),
      makeStage(),
      [makeCriterion({ ratingScaleId: "scale1" })],
      [{ id: "scale1", reviewFrameworkId: "fw1", name: "Scale", description: null, createdAt: new Date(), updatedAt: new Date(), bands: [] } as never],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("MISSING_RATING_SCALE");
  });

  it("rejects a rating scale band value outside the criterion's [min, max] range", () => {
    const result = validateFrameworkForPublish(
      makeFramework(),
      makeStage(),
      [makeCriterion({ ratingScaleId: "scale1", minScore: "0", maxScore: "5" })],
      [
        {
          id: "scale1",
          reviewFrameworkId: "fw1",
          name: "Scale",
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          bands: [{ id: "b1", ratingScaleId: "scale1", value: new Prisma.Decimal(9), label: "Too high", description: null, behavioralAnchor: null, evidenceExpectation: null, displayOrder: 0 }],
        } as never,
      ],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("SCALE_OUT_OF_CRITERION_RANGE");
  });

  it("rejects when the configured total doesn't match the stage's declared maximum", () => {
    const result = validateFrameworkForPublish(
      makeFramework(),
      makeStage({ maxTotalScore: "60" }),
      [makeCriterion({ maxScore: "10" })],
      [],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((i) => i.code)).toContain("TOTAL_MISMATCH");
  });

  it("returns the computed total when the framework is valid", () => {
    const result = validateFrameworkForPublish(
      makeFramework(),
      makeStage({ maxTotalScore: "20" }),
      [makeCriterion({ id: "a", code: "A", maxScore: "10" }), makeCriterion({ id: "b", code: "B", maxScore: "10" })],
      [],
    );
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.totalConfiguredScore.toString()).toBe("20");
  });
});
