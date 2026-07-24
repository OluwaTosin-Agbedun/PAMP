import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn(),
}));

import { saveDraftScoresAction, submitReviewAction } from "@/app/(dashboard)/reviews/[assignmentId]/actions";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { publishReviewFramework } from "@/modules/reviews/services/frameworkService";
import { createReview } from "@/modules/reviews/services/reviewService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestReviewAssignment,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

function actingAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);
}

/** A published two-criterion (10 + 10 = 20) framework, an eligible application, and a ready-to-score review. */
async function setUpFixture(adminId: string, reviewerId: string) {
  const { programme, cohort } = await createTestProgrammeAndCohort();
  const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "20" });
  const criterionA = await createTestCriterion(framework.id, { code: "A", label: "Criterion A", maxScore: "10", displayOrder: 0 });
  const criterionB = await createTestCriterion(framework.id, { code: "B", label: "Criterion B", maxScore: "10", displayOrder: 1 });
  await publishReviewFramework(adminId, { frameworkId: framework.id });
  const { application } = await createTestApplication(cohort.id);
  const assignment = await createTestReviewAssignment(application.id, reviewerId);
  const review = await createReview(reviewerId, assignment.id);
  return { programme, cohort, framework, criterionA, criterionB, application, assignment, review };
}

describe("Reviewer Workspace Server Actions (Phase 3C)", () => {
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  describe("saveDraftScoresAction", () => {
    it("redirects to /login when there is no session", async () => {
      actingAs("");
      vi.mocked(auth).mockResolvedValue(null as never);

      await expect(saveDraftScoresAction({ reviewId: "does-not-matter", scores: [] })).rejects.toThrow(/^REDIRECT:\/login/);
    });

    it("returns a validation error for malformed input, without touching the database", async () => {
      const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      actingAs(reviewer.id);

      const result = await saveDraftScoresAction({ reviewId: "", scores: "not-an-array" });
      expect("error" in result).toBe(true);
    });

    it("saves a partial draft and returns the running total for only the scored criteria", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      const fixture = await setUpFixture(admin.id, reviewer.id);
      actingAs(reviewer.id);
      try {
        const result = await saveDraftScoresAction({
          reviewId: fixture.review.id,
          scores: [{ criterionId: fixture.criterionA.id, score: "7" }],
        });

        expect("error" in result).toBe(false);
        if ("error" in result) throw new Error("unreachable");
        expect(result.total).toBe("7");

        const stored = await prisma.review.findUniqueOrThrow({ where: { id: fixture.review.id } });
        expect(stored.status).toBe("IN_PROGRESS");
      } finally {
        await cleanupReviewFixtures(fixture.programme.id);
      }
    });

    it("rejects saving to a review that belongs to a different reviewer (ownership enforced, not just permission)", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: owner } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      const { user: intruder } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      const fixture = await setUpFixture(admin.id, owner.id);
      actingAs(intruder.id);
      try {
        const result = await saveDraftScoresAction({
          reviewId: fixture.review.id,
          scores: [{ criterionId: fixture.criterionA.id, score: "7" }],
        });
        expect("error" in result).toBe(true);
      } finally {
        await cleanupReviewFixtures(fixture.programme.id);
      }
    });
  });

  describe("submitReviewAction", () => {
    it("submits a complete review and locks it in", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      const fixture = await setUpFixture(admin.id, reviewer.id);
      actingAs(reviewer.id);
      try {
        const result = await submitReviewAction({
          reviewId: fixture.review.id,
          scores: [
            { criterionId: fixture.criterionA.id, score: "8" },
            { criterionId: fixture.criterionB.id, score: "6" },
          ],
          comments: "Solid application.",
        });

        expect("error" in result).toBe(false);
        if ("error" in result) throw new Error("unreachable");
        expect(result.total).toBe("14");

        const stored = await prisma.review.findUniqueOrThrow({ where: { id: fixture.review.id } });
        expect(stored.status).toBe("SUBMITTED");
      } finally {
        await cleanupReviewFixtures(fixture.programme.id);
      }
    });

    it("returns an inline error (not a thrown exception) for an incomplete submission", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      const fixture = await setUpFixture(admin.id, reviewer.id);
      actingAs(reviewer.id);
      try {
        const result = await submitReviewAction({
          reviewId: fixture.review.id,
          scores: [{ criterionId: fixture.criterionA.id, score: "8" }],
        });
        expect("error" in result).toBe(true);

        const stored = await prisma.review.findUniqueOrThrow({ where: { id: fixture.review.id } });
        expect(stored.status).not.toBe("SUBMITTED");
      } finally {
        await cleanupReviewFixtures(fixture.programme.id);
      }
    });
  });
});
