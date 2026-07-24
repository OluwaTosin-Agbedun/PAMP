import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Review-framework/lifecycle integration tests get their own isolated
 * Programme (and everything under it) rather than reusing the real
 * PAM-P programme — a ReviewStage's uniqueness is scoped to
 * (programmeId, cohortId, code), so a dedicated test programme means
 * these tests can create/publish/retire freely without ever touching
 * the real seeded "Application Review" (max 60) stage, and cleanup is a
 * single `cleanupReviewFixtures(programmeId)` call at the end.
 */
export async function createTestProgrammeAndCohort() {
  const suffix = randomUUID();
  const programme = await prisma.programme.create({
    data: { name: `Test Programme ${suffix}`, slug: `test-programme-${suffix}` },
  });
  const cohort = await prisma.cohort.create({
    data: { programmeId: programme.id, name: "Test Cohort", year: 2099, isActive: false },
  });
  return { programme, cohort };
}

export async function createTestApplication(
  cohortId: string,
  overrides?: { eligibilityStatus?: "PENDING" | "ELIGIBLE" | "INELIGIBLE" | "CLARIFICATION_REQUIRED" | "DISQUALIFIED" },
) {
  const suffix = randomUUID();
  const applicant = await prisma.applicant.create({
    data: {
      cohortId,
      firstName: "Test",
      lastName: "Applicant",
      email: `applicant-${suffix}@test.pam-p.invalid`,
    },
  });
  const application = await prisma.application.create({
    data: {
      applicantId: applicant.id,
      cohortId,
      eligibilityStatus: overrides?.eligibilityStatus ?? "ELIGIBLE",
      stage: "UNDER_REVIEW",
    },
  });
  return { applicant, application };
}

export async function createTestReviewAssignment(
  applicationId: string,
  reviewerId: string,
  slot: "FIRST" | "SECOND" | "THIRD" = "FIRST",
) {
  return prisma.reviewAssignment.create({
    data: { applicationId, reviewerId, slot, assignedMethod: "MANUAL" },
  });
}

/** A minimal DRAFT review stage + framework, ready to have criteria added. */
export async function createTestStageAndDraftFramework(
  programmeId: string,
  cohortId: string,
  overrides?: { maxTotalScore?: string; code?: string },
) {
  const stage = await prisma.reviewStage.create({
    data: {
      programmeId,
      cohortId,
      name: "Test Stage",
      code: overrides?.code ?? `TEST_STAGE_${randomUUID().slice(0, 8)}`,
      maxTotalScore: new Prisma.Decimal(overrides?.maxTotalScore ?? "10"),
      status: "DRAFT",
    },
  });
  const framework = await prisma.reviewFramework.create({
    data: { reviewStageId: stage.id, programmeId, cohortId, version: 1, status: "DRAFT" },
  });
  return { stage, framework };
}

export async function createTestCriterion(
  reviewFrameworkId: string,
  overrides?: Partial<{
    code: string;
    label: string;
    maxScore: string;
    minScore: string;
    weight: string;
    isMandatory: boolean;
    isCommentMandatory: boolean;
    allowDecimalScores: boolean;
    reviewerGuidance: string | null;
    ratingScaleId: string | null;
    displayOrder: number;
  }>,
) {
  return prisma.reviewCriterion.create({
    data: {
      reviewFrameworkId,
      code: overrides?.code ?? `CRIT_${randomUUID().slice(0, 8)}`,
      label: overrides?.label ?? "Test Criterion",
      reviewerGuidance: overrides?.reviewerGuidance ?? "Score based on the rubric.",
      maxScore: new Prisma.Decimal(overrides?.maxScore ?? "10"),
      minScore: new Prisma.Decimal(overrides?.minScore ?? "0"),
      weight: new Prisma.Decimal(overrides?.weight ?? "1"),
      isMandatory: overrides?.isMandatory ?? true,
      isCommentMandatory: overrides?.isCommentMandatory ?? false,
      allowDecimalScores: overrides?.allowDecimalScores ?? true,
      ratingScaleId: overrides?.ratingScaleId ?? null,
      displayOrder: overrides?.displayOrder ?? 0,
    },
  });
}

/** A cohort's interview question framework (Release 1 Module 2) — flat, no version/publish lifecycle, unlike ReviewCriterion. */
export async function createTestInterviewCriterion(
  cohortId: string,
  overrides?: Partial<{ label: string; description: string | null; maxScore: string; weight: string; order: number; isActive: boolean }>,
) {
  return prisma.interviewCriterion.create({
    data: {
      cohortId,
      label: overrides?.label ?? "Test Question",
      description: overrides?.description ?? null,
      maxScore: new Prisma.Decimal(overrides?.maxScore ?? "10"),
      weight: new Prisma.Decimal(overrides?.weight ?? "1"),
      order: overrides?.order ?? 0,
      isActive: overrides?.isActive ?? true,
    },
  });
}

/** Deletes everything created under a test programme, in FK-safe order. */
export async function cleanupReviewFixtures(programmeId: string) {
  const cohorts = await prisma.cohort.findMany({ where: { programmeId }, select: { id: true } });
  const cohortIds = cohorts.map((c) => c.id);

  if (cohortIds.length > 0) {
    // RankingSnapshot has no onDelete:Cascade to Application (it's the
    // immutable point-in-time record — see its doc comment), so a
    // RankingSnapshotEntry referencing one of these applications would
    // otherwise block the Application delete below. Deleting the
    // snapshot cascades to its entries (onDelete: Cascade there).
    await prisma.rankingSnapshot.deleteMany({ where: { cohortId: { in: cohortIds } } });
    // Application cascade-deletes ReviewAssignment/Review/ReviewScore/
    // ReviewConflictOfInterest/ReviewEscalation/Interview/InterviewPanelist/
    // InterviewScore/InterviewScoreEntry/InterviewConflictOfInterest (all
    // `onDelete: Cascade` on applicationId, directly or transitively) —
    // see their doc comments in schema.prisma. This must run *before*
    // the InterviewCriterion cleanup below: InterviewScoreEntry's FK to
    // InterviewCriterion has no cascade of its own, so as long as any
    // InterviewScoreEntry row still exists, InterviewCriterion can't be
    // deleted — deleting Application first removes those entries via the
    // Interview → InterviewScore → InterviewScoreEntry cascade chain.
    await prisma.application.deleteMany({ where: { cohortId: { in: cohortIds } } });
    await prisma.applicant.deleteMany({ where: { cohortId: { in: cohortIds } } });
    // InterviewCriterion/InterviewQuestion/InterviewerAvailability have no
    // onDelete:Cascade to Cohort (their FK is the default RESTRICT) — must
    // go before the cohort.deleteMany below. Any InterviewQuestionAsked
    // rows are already gone via the Application → Interview cascade above,
    // so this delete never hits its own RESTRICT FK from that table.
    await prisma.interviewCriterion.deleteMany({ where: { cohortId: { in: cohortIds } } });
    await prisma.interviewQuestion.deleteMany({ where: { cohortId: { in: cohortIds } } });
    await prisma.interviewerAvailability.deleteMany({ where: { cohortId: { in: cohortIds } } });
  }

  // ReviewerCapacity/ProgrammeWindow/InterviewerCapacity are keyed by
  // programmeId directly — not reachable via the Application cascade
  // above — so they need their own cleanup. ProgrammeWindow's FK is
  // onDelete: RESTRICT (Release 1.5), so it must be deleted before the
  // Programme row itself; InterviewerCapacity (Release 1 Module 1) has
  // the same restriction.
  await prisma.reviewerCapacity.deleteMany({ where: { programmeId } });
  await prisma.interviewerCapacity.deleteMany({ where: { programmeId } });
  await prisma.programmeWindow.deleteMany({ where: { programmeId } });
  await prisma.reviewFramework.deleteMany({ where: { programmeId } });
  await prisma.reviewStage.deleteMany({ where: { programmeId } });
  await prisma.auditLog.deleteMany({ where: { programmeId } });
  await prisma.cohort.deleteMany({ where: { programmeId } });
  await prisma.programme.deleteMany({ where: { id: programmeId } });
}
