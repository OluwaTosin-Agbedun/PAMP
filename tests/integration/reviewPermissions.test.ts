import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import {
  createReviewFrameworkDraft,
  publishReviewFramework,
} from "@/modules/reviews/services/frameworkService";
import { createReview, reopenReview, submitReview } from "@/modules/reviews/services/reviewService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestReviewAssignment,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

/**
 * Dedicated permission-boundary tests (§25.3) — separate from
 * reviewFramework.test.ts/reviewLifecycle.test.ts, which each cover one
 * denial case inline as part of a broader flow. These specifically
 * enumerate the role matrix from §16: who can create/publish a
 * framework, and confirm every service function derives the actor's
 * permission fresh from `requirePermission(actorId, ...)` — reading the
 * database by id — rather than from anything the caller passes in. None
 * of these service functions accept a role/permission field as input at
 * all, so there is no "client-supplied role" parameter to even attempt
 * to smuggle a bypass through; that is the point being demonstrated.
 */
describe("review framework/lifecycle permission boundaries (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("a Programme Director (authorized) can create and publish a framework", async () => {
    const { user: director } = await createTestUser({ role: Role.PROGRAMME_DIRECTOR });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { stage } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      const framework = await createReviewFrameworkDraft(director.id, { reviewStageId: stage.id });
      await createTestCriterion(framework.id, { code: "A", maxScore: "10" });

      const published = await publishReviewFramework(director.id, { frameworkId: framework.id });
      expect(published?.status).toBe("PUBLISHED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("an Application Reviewer cannot publish a framework, even one they can see", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      await createTestCriterion(framework.id, { code: "A", maxScore: "10" });

      await expect(publishReviewFramework(reviewer.id, { frameworkId: framework.id })).rejects.toBeInstanceOf(
        AuthorisationError,
      );

      const unchanged = await prisma.reviewFramework.findUniqueOrThrow({ where: { id: framework.id } });
      expect(unchanged.status).toBe("DRAFT");

      // Confirm the admin (a different actor entirely) still can — the
      // rejection above was about *who* asked, not the framework itself.
      const published = await publishReviewFramework(admin.id, { frameworkId: framework.id });
      expect(published?.status).toBe("PUBLISHED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("a Programme Secretary cannot reopen a submitted review (view-only role for this capability)", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      const criterion = await createTestCriterion(framework.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: framework.id });
      const { application } = await createTestApplication(cohort.id);
      const assignment = await createTestReviewAssignment(application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);
      await submitReview(reviewer.id, { reviewId: review.id, scores: [{ criterionId: criterion.id, score: "5" }] });

      await expect(
        reopenReview(secretary.id, { reviewId: review.id, reason: "Attempting an unauthorised reopen." }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("an inactive System Administrator account is denied exactly like any other inactive account", async () => {
    const { user: suspendedAdmin } = await createTestUser({ role: Role.SYSTEM_ADMIN, status: "SUSPENDED" });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { stage } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      await expect(createReviewFrameworkDraft(suspendedAdmin.id, { reviewStageId: stage.id })).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
