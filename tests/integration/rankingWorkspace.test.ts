import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Prisma, Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import { approveFinalRanking, generateFinalRanking, reopenFinalRanking, resolveTie } from "@/modules/ranking/services/rankingService";
import { getRankingWorkspace } from "@/modules/ranking/services/rankingWorkspaceService";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

async function setApplicationScore(
  applicationId: string,
  cohortId: string,
  data: { reviewAverage: string | null; interviewAverage: string | null },
) {
  return prisma.applicationScore.upsert({
    where: { applicationId },
    create: {
      applicationId,
      cohortId,
      reviewAverage: data.reviewAverage ? new Prisma.Decimal(data.reviewAverage) : null,
      interviewAverage: data.interviewAverage ? new Prisma.Decimal(data.interviewAverage) : null,
    },
    update: {
      reviewAverage: data.reviewAverage ? new Prisma.Decimal(data.reviewAverage) : null,
      interviewAverage: data.interviewAverage ? new Prisma.Decimal(data.interviewAverage) : null,
    },
  });
}

async function markIntegrityHold(applicationId: string, cohortId: string, panelistId: string) {
  const interview = await prisma.interview.create({ data: { applicationId, cohortId, status: "COMPLETED" } });
  await prisma.interviewScore.create({
    data: { interviewId: interview.id, panelistId, status: "SUBMITTED", integrityFlag: true, submittedAt: new Date() },
  });
}

describe("Final Ranking workspace (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("ranks eligible applications highest-first and excludes the rest with a reason", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: top } = await createTestApplication(cohort.id);
      const { application: mid } = await createTestApplication(cohort.id);
      const { application: incomplete } = await createTestApplication(cohort.id);
      const { application: notEligible } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });

      await setApplicationScore(top.id, cohort.id, { reviewAverage: "55", interviewAverage: "38" });
      await setApplicationScore(mid.id, cohort.id, { reviewAverage: "48", interviewAverage: "30" });
      await setApplicationScore(incomplete.id, cohort.id, { reviewAverage: "40", interviewAverage: null });
      await setApplicationScore(notEligible.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });

      const result = await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      expect(result.excluded.map((e) => e.applicationId).sort()).toEqual([incomplete.id, notEligible.id].sort());
      expect(result.excluded.find((e) => e.applicationId === incomplete.id)?.reason).toBe("MISSING_INTERVIEW_SCORE");
      expect(result.excluded.find((e) => e.applicationId === notEligible.id)?.reason).toBe("APPLICATION_NOT_ELIGIBLE");

      const snapshot = await prisma.rankingSnapshot.findUniqueOrThrow({
        where: { id: result.snapshot.id },
        include: { entries: { orderBy: { rank: "asc" } } },
      });
      expect(snapshot.entries.map((e) => e.applicationId)).toEqual([top.id, mid.id]);
      expect(snapshot.entries[0].score.toString()).toBe("93"); // 55 + 38
      expect(snapshot.entries[1].score.toString()).toBe("78"); // 48 + 30

      const topScore = await prisma.applicationScore.findUniqueOrThrow({ where: { applicationId: top.id } });
      expect(topScore.rank).toBe(1);
      const incompleteScore = await prisma.applicationScore.findUniqueOrThrow({ where: { applicationId: incomplete.id } });
      expect(incompleteScore.rank).toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { action: "RANKING_GENERATED", entityId: result.snapshot.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("excludes an application with an interview integrity hold, regardless of its score", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: panelist } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: held } = await createTestApplication(cohort.id);
      const { application: clean } = await createTestApplication(cohort.id);
      await setApplicationScore(held.id, cohort.id, { reviewAverage: "58", interviewAverage: "39" });
      await setApplicationScore(clean.id, cohort.id, { reviewAverage: "45", interviewAverage: "30" });
      await markIntegrityHold(held.id, cohort.id, panelist.id);

      const result = await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].applicationId).toBe(held.id);
      expect(result.excluded[0].reason).toBe("INTEGRITY_HOLD");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("detects a Level 3 tie and creates a pending tie resolution", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: a } = await createTestApplication(cohort.id);
      const { application: b } = await createTestApplication(cohort.id);
      await setApplicationScore(a.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });
      await setApplicationScore(b.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });

      const result = await generateFinalRanking(secretary.id, { cohortId: cohort.id });
      expect(result.tieGroupCount).toBe(1);

      const workspace = await getRankingWorkspace(secretary.id, cohort.id);
      expect(workspace.tieResolutions).toHaveLength(1);
      expect(workspace.tieResolutions[0].status).toBe("PENDING");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("refuses to regenerate while the current ranking is approved and locked", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: director } = await createTestUser({ role: Role.PROGRAMME_DIRECTOR });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await setApplicationScore(application.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });

      const first = await generateFinalRanking(secretary.id, { cohortId: cohort.id });
      await approveFinalRanking(director.id, { rankingSnapshotId: first.snapshot.id });

      await expect(generateFinalRanking(secretary.id, { cohortId: cohort.id })).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("refuses to approve while a Level 3 tie is unresolved, then allows it once resolved", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: director } = await createTestUser({ role: Role.PROGRAMME_DIRECTOR });
    const { user: committeeMember } = await createTestUser({ role: Role.SELECTION_COMMITTEE_MEMBER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: a } = await createTestApplication(cohort.id);
      const { application: b } = await createTestApplication(cohort.id);
      await setApplicationScore(a.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });
      await setApplicationScore(b.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });

      const generated = await generateFinalRanking(secretary.id, { cohortId: cohort.id });
      await expect(approveFinalRanking(director.id, { rankingSnapshotId: generated.snapshot.id })).rejects.toThrow();

      const workspace = await getRankingWorkspace(secretary.id, cohort.id);
      const tie = workspace.tieResolutions[0];

      await resolveTie(committeeMember.id, {
        tieResolutionId: tie.id,
        justification: "Committee reviewed leadership pathway suitability and cohort balance.",
        resolvedRanks: [
          { applicationId: a.id, resolvedRank: 1 },
          { applicationId: b.id, resolvedRank: 2 },
        ],
      });

      const approved = await approveFinalRanking(director.id, { rankingSnapshotId: generated.snapshot.id });
      expect(approved!.isLocked).toBe(true);

      const auditResolved = await prisma.auditLog.findFirst({ where: { action: "RANKING_TIE_RESOLVED", entityId: tie.id } });
      expect(auditResolved).not.toBeNull();
      const auditApproved = await prisma.auditLog.findFirst({ where: { action: "RANKING_APPROVED", entityId: generated.snapshot.id } });
      expect(auditApproved).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("rejects a tie resolution that doesn't cover exactly the tied applications", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: committeeMember } = await createTestUser({ role: Role.SELECTION_COMMITTEE_MEMBER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: a } = await createTestApplication(cohort.id);
      const { application: b } = await createTestApplication(cohort.id);
      await setApplicationScore(a.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });
      await setApplicationScore(b.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });
      await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      const workspace = await getRankingWorkspace(secretary.id, cohort.id);
      const tie = workspace.tieResolutions[0];

      await expect(
        resolveTie(committeeMember.id, {
          tieResolutionId: tie.id,
          justification: "Missing one applicant from the resolved order.",
          resolvedRanks: [{ applicationId: a.id, resolvedRank: 1 }],
        }),
      ).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("reopens a locked ranking only with a reason, and re-locks on a fresh approval", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: director } = await createTestUser({ role: Role.PROGRAMME_DIRECTOR });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await setApplicationScore(application.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });

      const generated = await generateFinalRanking(secretary.id, { cohortId: cohort.id });
      await approveFinalRanking(director.id, { rankingSnapshotId: generated.snapshot.id });

      const reopened = await reopenFinalRanking(admin.id, {
        rankingSnapshotId: generated.snapshot.id,
        reason: "Upstream review score was corrected after approval.",
      });
      expect(reopened!.isLocked).toBe(false);

      // A Director cannot reopen — mirrors REVIEW_SCORES_REOPEN's System-Administrator-only placement.
      await expect(
        reopenFinalRanking(director.id, {
          rankingSnapshotId: generated.snapshot.id,
          reason: "Attempting to reopen without the right permission.",
        }),
      ).rejects.toThrow(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("enforces permissions: a role without ranking.generate cannot generate a ranking", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await expect(generateFinalRanking(reviewer.id, { cohortId: cohort.id })).rejects.toThrow(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("enforces permissions: only ranking.resolve_ties (Selection Committee) may resolve a tie", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: a } = await createTestApplication(cohort.id);
      const { application: b } = await createTestApplication(cohort.id);
      await setApplicationScore(a.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });
      await setApplicationScore(b.id, cohort.id, { reviewAverage: "50", interviewAverage: "35" });
      await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      const workspace = await getRankingWorkspace(secretary.id, cohort.id);
      const tie = workspace.tieResolutions[0];

      // The Secretariat itself does not hold ranking.resolve_ties.
      await expect(
        resolveTie(secretary.id, {
          tieResolutionId: tie.id,
          justification: "The Secretariat should not be able to do this.",
          resolvedRanks: [
            { applicationId: a.id, resolvedRank: 1 },
            { applicationId: b.id, resolvedRank: 2 },
          ],
        }),
      ).rejects.toThrow(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
