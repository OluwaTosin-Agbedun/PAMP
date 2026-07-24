import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, ConflictError } from "@/lib/errors";
import { autoAssignPanel, scheduleInterview } from "@/modules/interviews/services/panelAssignmentService";
import { getInterviewScoreOverviewForSecretariat } from "@/modules/interviews/services/interviewScoreService";
import {
  createQuestion,
  endInterviewSession,
  getQuestionFrameworkForInterview,
  listQuestionsForCohort,
  selectAdditionalQuestion,
  setQuestionActive,
  startInterviewSession,
  updateQuestion,
} from "@/modules/interviews/services/interviewQuestionService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

async function setUpInterview(adminId: string, cohortId: string) {
  await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
  const { application } = await createTestApplication(cohortId);
  const interview = await scheduleInterview(adminId, cohortId, {
    applicationId: application.id,
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await autoAssignPanel(interview.id);
  const panelists = await prisma.interviewPanelist.findMany({ where: { interviewId: interview.id, status: "ASSIGNED" } });
  return { application, interview, panelists };
}

describe("Addendum Module 3 — Interview Questions", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe("question bank management", () => {
    it("denies bank management to a role without interview_questions.manage", async () => {
      const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
      await expect(
        createQuestion(secretary.id, { text: "Tell us about yourself.", category: "MANDATORY" }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    });

    it("Director/Admin can create mandatory, pathway, and additional-bank questions", async () => {
      // PROGRAMME_DIRECTOR specifically here (not SYSTEM_ADMIN, which trivially has every
      // permission) — proves INTERVIEW_QUESTIONS_MANAGE's PROGRAMME_OVERSIGHT placement covers it.
      const { user: director } = await createTestUser({ role: Role.PROGRAMME_DIRECTOR });

      const mandatory = await createQuestion(director.id, { text: "Tell us about yourself.", category: "MANDATORY" });
      expect(mandatory.category).toBe("MANDATORY");

      const pathway = await createQuestion(director.id, {
        text: "Describe your business idea.",
        category: "PATHWAY",
        pathway: "ENTREPRENEURSHIP_ENTERPRISE",
      });
      expect(pathway.pathway).toBe("ENTREPRENEURSHIP_ENTERPRISE");

      const bank = await createQuestion(director.id, { text: "What's your biggest failure?", category: "ADDITIONAL_BANK" });
      expect(bank.category).toBe("ADDITIONAL_BANK");

      const audit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_QUESTION_CREATED", entityId: mandatory.id } });
      expect(audit).not.toBeNull();

      const listed = await listQuestionsForCohort(director.id);
      const listedMandatory = listed.find((q) => q.id === mandatory.id);
      expect(listedMandatory?.hasBeenAsked).toBe(false);

      await prisma.interviewQuestion.deleteMany({ where: { id: { in: [mandatory.id, pathway.id, bank.id] } } });
    });

    it("locks text/category/pathway once a question has been asked, but leaves isActive editable", async () => {
      const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { programme, cohort } = await createTestProgrammeAndCohort();
      try {
        const question = await createQuestion(director.id, { text: "Tell us about yourself.", category: "MANDATORY" });
        // Reassign to the isolated test cohort directly (createQuestion always targets getActiveCohort()).
        await prisma.interviewQuestion.update({ where: { id: question.id }, data: { cohortId: cohort.id } });

        const fixture = await setUpInterview(director.id, cohort.id);
        await startInterviewSession(fixture.panelists[0].userId, fixture.interview.id);

        await expect(
          updateQuestion(director.id, { questionId: question.id, text: "Changed.", category: "MANDATORY" }),
        ).rejects.toBeInstanceOf(ConflictError);

        // isActive is not covered by updateQuestion's lock.
        const toggled = await setQuestionActive(director.id, { questionId: question.id, isActive: false });
        expect(toggled.isActive).toBe(false);
      } finally {
        await cleanupReviewFixtures(programme.id);
      }
    });
  });

  describe("interview session lifecycle", () => {
    it("starting the session auto-records active mandatory and matched-pathway questions, never additional-bank ones", async () => {
      const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { programme, cohort } = await createTestProgrammeAndCohort();
      try {
        const mandatory = await prisma.interviewQuestion.create({
          data: { cohortId: cohort.id, text: "Mandatory Q", category: "MANDATORY" },
        });
        const matchedPathway = await prisma.interviewQuestion.create({
          data: { cohortId: cohort.id, text: "Pathway Q (matches)", category: "PATHWAY", pathway: "ACADEMIA_ADVANCED_STUDIES" },
        });
        await prisma.interviewQuestion.create({
          data: { cohortId: cohort.id, text: "Pathway Q (does not match)", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" },
        });
        await prisma.interviewQuestion.create({
          data: { cohortId: cohort.id, text: "Bank Q", category: "ADDITIONAL_BANK" },
        });

        const fixture = await setUpInterview(director.id, cohort.id);
        await prisma.application.update({ where: { id: fixture.application.id }, data: { pathway: "Academia & Advanced Studies" } });

        const panelistId = fixture.panelists[0].userId;
        await startInterviewSession(panelistId, fixture.interview.id);

        const asked = await prisma.interviewQuestionAsked.findMany({ where: { interviewId: fixture.interview.id } });
        expect(asked.map((a) => a.questionId).sort()).toEqual([mandatory.id, matchedPathway.id].sort());

        const audit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_SESSION_STARTED", entityId: fixture.interview.id } });
        expect(audit).not.toBeNull();

        const interview = await prisma.interview.findUniqueOrThrow({ where: { id: fixture.interview.id } });
        expect(interview.actualStartedAt).not.toBeNull();
        expect(interview.actualStartedById).toBe(panelistId);
      } finally {
        await cleanupReviewFixtures(programme.id);
      }
    });

    it("rejects starting a session for someone not on the interview's panel", async () => {
      const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { programme, cohort } = await createTestProgrammeAndCohort();
      try {
        const fixture = await setUpInterview(director.id, cohort.id);
        const { user: outsider } = await createTestUser({ role: Role.INTERVIEWER });
        await expect(startInterviewSession(outsider.id, fixture.interview.id)).rejects.toBeInstanceOf(AuthorisationError);
      } finally {
        await cleanupReviewFixtures(programme.id);
      }
    });

    it("rejects starting a session that's already started", async () => {
      const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { programme, cohort } = await createTestProgrammeAndCohort();
      try {
        const fixture = await setUpInterview(director.id, cohort.id);
        const panelistId = fixture.panelists[0].userId;
        await startInterviewSession(panelistId, fixture.interview.id);
        await expect(startInterviewSession(panelistId, fixture.interview.id)).rejects.toBeInstanceOf(ConflictError);
      } finally {
        await cleanupReviewFixtures(programme.id);
      }
    });

    it("rejects ending a session that hasn't started, and rejects ending it twice", async () => {
      const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { programme, cohort } = await createTestProgrammeAndCohort();
      try {
        const fixture = await setUpInterview(director.id, cohort.id);
        const panelistId = fixture.panelists[0].userId;

        await expect(endInterviewSession(panelistId, fixture.interview.id)).rejects.toBeInstanceOf(ConflictError);

        await startInterviewSession(panelistId, fixture.interview.id);
        await endInterviewSession(panelistId, fixture.interview.id);

        await expect(endInterviewSession(panelistId, fixture.interview.id)).rejects.toBeInstanceOf(ConflictError);

        const audit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_SESSION_ENDED", entityId: fixture.interview.id } });
        expect(audit).not.toBeNull();
      } finally {
        await cleanupReviewFixtures(programme.id);
      }
    });
  });

  describe("additional question selection", () => {
    it("requires the session to be started, rejects after it's ended, and rejects a duplicate pick", async () => {
      const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { programme, cohort } = await createTestProgrammeAndCohort();
      try {
        const bankQuestion = await prisma.interviewQuestion.create({
          data: { cohortId: cohort.id, text: "Bank Q", category: "ADDITIONAL_BANK" },
        });
        const fixture = await setUpInterview(director.id, cohort.id);
        const panelistId = fixture.panelists[0].userId;

        await expect(
          selectAdditionalQuestion(panelistId, { interviewId: fixture.interview.id, questionId: bankQuestion.id }),
        ).rejects.toBeInstanceOf(ConflictError);

        await startInterviewSession(panelistId, fixture.interview.id);
        await selectAdditionalQuestion(panelistId, { interviewId: fixture.interview.id, questionId: bankQuestion.id });

        await expect(
          selectAdditionalQuestion(panelistId, { interviewId: fixture.interview.id, questionId: bankQuestion.id }),
        ).rejects.toBeInstanceOf(ConflictError);

        const audit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_ADDITIONAL_QUESTION_SELECTED", entityId: fixture.interview.id } });
        expect(audit).not.toBeNull();

        await endInterviewSession(panelistId, fixture.interview.id);
        const anotherBankQuestion = await prisma.interviewQuestion.create({
          data: { cohortId: cohort.id, text: "Another bank Q", category: "ADDITIONAL_BANK" },
        });
        await expect(
          selectAdditionalQuestion(panelistId, { interviewId: fixture.interview.id, questionId: anotherBankQuestion.id }),
        ).rejects.toBeInstanceOf(ConflictError);
      } finally {
        await cleanupReviewFixtures(programme.id);
      }
    });

    it("rejects selecting a mandatory or pathway question as an additional pick", async () => {
      const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { programme, cohort } = await createTestProgrammeAndCohort();
      try {
        const mandatory = await prisma.interviewQuestion.create({
          data: { cohortId: cohort.id, text: "Mandatory Q", category: "MANDATORY" },
        });
        const fixture = await setUpInterview(director.id, cohort.id);
        const panelistId = fixture.panelists[0].userId;
        await startInterviewSession(panelistId, fixture.interview.id);

        await expect(
          selectAdditionalQuestion(panelistId, { interviewId: fixture.interview.id, questionId: mandatory.id }),
        ).rejects.toBeInstanceOf(ConflictError);
      } finally {
        await cleanupReviewFixtures(programme.id);
      }
    });
  });

  it("getQuestionFrameworkForInterview reflects auto-asked, available additional, and asked questions correctly", async () => {
    const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const mandatory = await prisma.interviewQuestion.create({
        data: { cohortId: cohort.id, text: "Mandatory Q", category: "MANDATORY" },
      });
      const bankQuestion = await prisma.interviewQuestion.create({
        data: { cohortId: cohort.id, text: "Bank Q", category: "ADDITIONAL_BANK" },
      });
      const fixture = await setUpInterview(director.id, cohort.id);
      const panelistId = fixture.panelists[0].userId;

      const before = await getQuestionFrameworkForInterview(fixture.interview.id, null);
      expect(before.autoAsked.map((q) => q.id)).toEqual([mandatory.id]);
      expect(before.availableAdditional.map((q) => q.id)).toEqual([bankQuestion.id]);
      expect(before.asked).toEqual([]);

      await startInterviewSession(panelistId, fixture.interview.id);
      await selectAdditionalQuestion(panelistId, { interviewId: fixture.interview.id, questionId: bankQuestion.id });

      const after = await getQuestionFrameworkForInterview(fixture.interview.id, null);
      expect(after.availableAdditional).toEqual([]);
      expect(after.asked.map((a) => a.questionId).sort()).toEqual([mandatory.id, bankQuestion.id].sort());
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("getInterviewScoreOverviewForSecretariat includes the asked-questions list for oversight", async () => {
    const { user: director } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const mandatory = await prisma.interviewQuestion.create({
        data: { cohortId: cohort.id, text: "Mandatory Q", category: "MANDATORY" },
      });
      const fixture = await setUpInterview(director.id, cohort.id);
      const panelistId = fixture.panelists[0].userId;
      await startInterviewSession(panelistId, fixture.interview.id);

      const overview = await getInterviewScoreOverviewForSecretariat(secretary.id, fixture.interview.id);
      expect(overview.askedQuestions).toHaveLength(1);
      expect(overview.askedQuestions[0].questionId).toBe(mandatory.id);
      expect(overview.askedQuestions[0].askedByPanelist.id).toBe(panelistId);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
