import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import {
  createCriterion,
  createReviewFrameworkDraft,
  createReviewStage,
  publishReviewFramework,
  retireReviewFramework,
  updateCriterion,
} from "@/modules/reviews/services/frameworkService";
import { AuthorisationError, FrameworkLockedError, InvalidReviewFrameworkError } from "@/lib/errors";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

describe("review framework lifecycle (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("creates a draft stage and framework via the service layer", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme } = await createTestProgrammeAndCohort();
    try {
      const stage = await createReviewStage(admin.id, {
        programmeId: programme.id,
        cohortId: null,
        name: "Application Review",
        code: "APPLICATION_REVIEW",
        maxTotalScore: "60",
        sequenceOrder: 0,
        commentsRequired: false,
        allCriteriaMandatory: true,
        allowPartialDraft: true,
      });
      expect(stage.status).toBe("DRAFT");

      const framework = await createReviewFrameworkDraft(admin.id, { reviewStageId: stage.id });
      expect(framework.version).toBe(1);
      expect(framework.status).toBe("DRAFT");
      expect(framework.programmeId).toBe(programme.id);

      const secondFramework = await createReviewFrameworkDraft(admin.id, { reviewStageId: stage.id });
      expect(secondFramework.version).toBe(2);

      const audit = await prisma.auditLog.findFirst({ where: { action: "REVIEW_STAGE_CREATED", entityId: stage.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("rejects framework creation/criterion changes from a user without the permission", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme } = await createTestProgrammeAndCohort();
    try {
      await expect(
        createReviewStage(reviewer.id, {
          programmeId: programme.id,
          cohortId: null,
          name: "Blocked",
          code: "BLOCKED",
          maxTotalScore: "10",
          sequenceOrder: 0,
          commentsRequired: false,
          allCriteriaMandatory: true,
          allowPartialDraft: true,
        }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("publishes a valid framework, computing and locking in the configured total", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "20" });
      await createTestCriterion(framework.id, { code: "A", maxScore: "10", weight: "1", displayOrder: 0 });
      await createTestCriterion(framework.id, { code: "B", maxScore: "10", weight: "1", displayOrder: 1 });

      const published = await publishReviewFramework(admin.id, { frameworkId: framework.id });
      expect(published?.status).toBe("PUBLISHED");
      expect(published?.totalConfiguredScore?.toString()).toBe("20");
      expect(published?.publishedById).toBe(admin.id);
      expect(published?.publishedAt).not.toBeNull();

      const stage = await prisma.reviewStage.findUniqueOrThrow({ where: { id: framework.reviewStageId } });
      expect(stage.status).toBe("ACTIVE");

      const audit = await prisma.auditLog.findFirst({ where: { action: "REVIEW_FRAMEWORK_PUBLISHED", entityId: framework.id } });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as { totalConfiguredScore?: string })?.totalConfiguredScore).toBe("20");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("rejects publishing a framework whose configured total doesn't match the stage maximum", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "60" });
      await createTestCriterion(framework.id, { code: "A", maxScore: "10" });

      await expect(publishReviewFramework(admin.id, { frameworkId: framework.id })).rejects.toBeInstanceOf(
        InvalidReviewFrameworkError,
      );

      const unchanged = await prisma.reviewFramework.findUniqueOrThrow({ where: { id: framework.id } });
      expect(unchanged.status).toBe("DRAFT");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("rejects publishing a framework with no active criteria", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id);
      await expect(publishReviewFramework(admin.id, { frameworkId: framework.id })).rejects.toBeInstanceOf(
        InvalidReviewFrameworkError,
      );
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("locks a published framework's criteria against further edits", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      const criterion = await createTestCriterion(framework.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: framework.id });

      await expect(
        updateCriterion(admin.id, { criterionId: criterion.id, label: "Renamed after publish" }),
      ).rejects.toBeInstanceOf(FrameworkLockedError);

      await expect(
        createCriterion(admin.id, {
          reviewFrameworkId: framework.id,
          code: "B",
          label: "New",
          maxScore: "5",
          minScore: "0",
          weight: "1",
          displayOrder: 0,
          isMandatory: true,
          isCommentMandatory: false,
          allowDecimalScores: true,
        }),
      ).rejects.toBeInstanceOf(FrameworkLockedError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("publishing a new version automatically retires the previously published version for the same stage", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { stage, framework: v1 } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      await createTestCriterion(v1.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: v1.id });

      const v2 = await prisma.reviewFramework.create({
        data: { reviewStageId: stage.id, programmeId: programme.id, cohortId: cohort.id, version: 2, status: "DRAFT" },
      });
      await createTestCriterion(v2.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: v2.id });

      const v1After = await prisma.reviewFramework.findUniqueOrThrow({ where: { id: v1.id } });
      expect(v1After.status).toBe("RETIRED");
      const v2After = await prisma.reviewFramework.findUniqueOrThrow({ where: { id: v2.id } });
      expect(v2After.status).toBe("PUBLISHED");

      const retiredAudit = await prisma.auditLog.findFirst({
        where: { action: "REVIEW_FRAMEWORK_RETIRED", entityId: v1.id },
      });
      expect(retiredAudit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("retires a published framework explicitly, with a reason", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      await createTestCriterion(framework.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: framework.id });

      const retired = await retireReviewFramework(admin.id, { frameworkId: framework.id, reason: "Superseded by policy change" });
      expect(retired?.status).toBe("RETIRED");
      expect(retired?.retiredById).toBe(admin.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("historical criteria remain retrievable after their framework is retired", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      const criterion = await createTestCriterion(framework.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: framework.id });
      await retireReviewFramework(admin.id, { frameworkId: framework.id });

      const stillThere = await prisma.reviewCriterion.findUnique({ where: { id: criterion.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere?.label).toBe(criterion.label);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("rejects retiring a framework that was never published", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id);
      await expect(retireReviewFramework(admin.id, { frameworkId: framework.id })).rejects.toBeInstanceOf(FrameworkLockedError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("two different test programmes' stages don't collide even with the same code", async () => {
    const { programme: p1, cohort: c1 } = await createTestProgrammeAndCohort();
    const { programme: p2, cohort: c2 } = await createTestProgrammeAndCohort();
    try {
      const { stage: s1 } = await createTestStageAndDraftFramework(p1.id, c1.id, { code: "SHARED_CODE" });
      const { stage: s2 } = await createTestStageAndDraftFramework(p2.id, c2.id, { code: "SHARED_CODE" });
      expect(s1.id).not.toBe(s2.id);
      expect(s1.programmeId).not.toBe(s2.programmeId);
    } finally {
      await cleanupReviewFixtures(p1.id);
      await cleanupReviewFixtures(p2.id);
    }
  });
});
