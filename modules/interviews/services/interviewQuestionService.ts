import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import {
  AuthorisationError,
  ConflictError,
  NotFoundError,
  ReviewConcurrencyError,
} from "@/lib/errors";
import { getActiveCohort } from "@/lib/cohort";
import { requirePermission } from "@/lib/permissions/service";
import { PERMISSIONS } from "@/lib/permissions/catalog";

import { matchApplicationPathway, seededRandom, selectAutoAskedQuestions } from "../domain/interviewQuestions";
import * as questionRepo from "../repositories/interviewQuestionRepository";
import * as interviewRepo from "../repositories/interviewRepository";
import * as panelistRepo from "../repositories/panelistRepository";
import type {
  CreateInterviewQuestionInput,
  SelectAdditionalQuestionInput,
  SetInterviewQuestionActiveInput,
  UpdateInterviewQuestionInput,
} from "../validation/schemas";

/**
 * Addendum Module 3 — the interview question bank (mandatory/pathway/
 * additional-bank CRUD, Director+Admin only) and the per-interview
 * question session (start/end, auto-recording mandatory/pathway
 * questions, panellists picking additional ones). A separate lifecycle
 * from interviewScoreService.ts's own score data — see ADR-0019.
 */

async function assertActivePanelist(interviewId: string, userId: string) {
  const rows = await panelistRepo.getActivePanelistsForUserIds(interviewId, [userId]);
  if (rows.length === 0) {
    throw new AuthorisationError("You are not an active panellist on this interview.");
  }
}

// ---------------------------------------------------------------------------
// Question bank management
// ---------------------------------------------------------------------------

export async function listQuestionsForCohort(actorId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_QUESTIONS_MANAGE);
  const cohort = await getActiveCohort();

  const [questions, askedQuestionIds] = await Promise.all([
    questionRepo.listQuestionsForCohort(cohort.id),
    questionRepo.listAskedQuestionIdsForCohort(cohort.id),
  ]);

  return questions.map((q) => ({ ...q, hasBeenAsked: askedQuestionIds.has(q.id) }));
}

export async function createQuestion(actorId: string, input: CreateInterviewQuestionInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_QUESTIONS_MANAGE);
  const cohort = await getActiveCohort();

  const question = await questionRepo.createQuestion({
    cohortId: cohort.id,
    text: input.text,
    category: input.category,
    pathway: input.pathway ?? null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_QUESTION_CREATED,
    entityType: "InterviewQuestion",
    entityId: question.id,
    metadata: { text: question.text, category: question.category, pathway: question.pathway },
  });

  return question;
}

/**
 * Text/category/pathway are locked once a question has been asked in any
 * interview (Addendum §3 — historical records must not be rewritten
 * after the fact; see ADR-0019). isActive/order aren't covered by this
 * function — setQuestionActive handles isActive separately, and neither
 * affects what was historically asked.
 */
export async function updateQuestion(actorId: string, input: UpdateInterviewQuestionInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_QUESTIONS_MANAGE);

  const existing = await questionRepo.getQuestion(input.questionId);
  if (!existing) throw new NotFoundError("That interview question doesn't exist.");

  if (await questionRepo.hasBeenAsked(input.questionId)) {
    throw new ConflictError("This question has already been asked in an interview and can no longer be edited.");
  }

  const updated = await questionRepo.updateQuestion(input.questionId, {
    text: input.text,
    category: input.category,
    pathway: input.pathway ?? null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_QUESTION_UPDATED,
    entityType: "InterviewQuestion",
    entityId: updated.id,
    metadata: { text: updated.text, category: updated.category, pathway: updated.pathway },
  });

  return updated;
}

export async function setQuestionActive(actorId: string, input: SetInterviewQuestionActiveInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_QUESTIONS_MANAGE);

  const existing = await questionRepo.getQuestion(input.questionId);
  if (!existing) throw new NotFoundError("That interview question doesn't exist.");

  const updated = await questionRepo.updateQuestion(input.questionId, { isActive: input.isActive });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_QUESTION_UPDATED,
    entityType: "InterviewQuestion",
    entityId: updated.id,
    metadata: { isActive: updated.isActive },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Per-interview question session
// ---------------------------------------------------------------------------

/**
 * Everything the workspace page needs to render the question framework:
 * mandatory + matched-pathway questions (always shown), the active
 * additional-bank pool not yet asked in this interview, what's already
 * been asked, and the session's start/end state.
 */
export async function getQuestionFrameworkForInterview(interviewId: string, applicationPathwayText: string | null) {
  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId }, select: { cohortId: true } });

  const [allQuestions, asked] = await Promise.all([
    questionRepo.listActiveQuestionsForCohort(interview.cohortId),
    questionRepo.listAskedForInterview(interviewId),
  ]);

  const applicationPathway = matchApplicationPathway(applicationPathwayText);
  // Seeded by interviewId, not Math.random — this preview must show
  // exactly what startInterviewSession will actually record, every time
  // this workspace is loaded before the session starts.
  const autoAsked = selectAutoAskedQuestions(allQuestions, applicationPathway, seededRandom(interviewId));
  const askedQuestionIds = new Set(asked.map((a) => a.questionId));
  const availableAdditional = allQuestions.filter((q) => q.category === "ADDITIONAL_BANK" && !askedQuestionIds.has(q.id));

  return { autoAsked, availableAdditional, asked };
}

export async function startInterviewSession(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_SESSION_MANAGE);
  await assertActivePanelist(interviewId, actorId);

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { application: { select: { pathway: true } } },
  });
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.actualStartedAt) throw new ConflictError("This interview session has already started.");

  const now = new Date();
  const autoAskedQuestions = selectAutoAskedQuestions(
    await questionRepo.listActiveQuestionsForCohort(interview.cohortId),
    matchApplicationPathway(interview.application.pathway),
    seededRandom(interviewId),
  );

  await prisma.$transaction(async (tx) => {
    const updated = await interviewRepo.applyActualStart(tx, interviewId, { actualStartedAt: now, actualStartedById: actorId });
    if (updated.count === 0) throw new ReviewConcurrencyError("This interview changed elsewhere — refresh and try again.");

    if (autoAskedQuestions.length > 0) {
      await questionRepo.createManyAskedRows(
        tx,
        autoAskedQuestions.map((q) => ({ interviewId, questionId: q.id, askedByPanelistId: actorId })),
      );
    }
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_SESSION_STARTED,
    entityType: "Interview",
    entityId: interviewId,
    metadata: { autoAskedQuestionCount: autoAskedQuestions.length },
  });
}

export async function endInterviewSession(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_SESSION_MANAGE);
  await assertActivePanelist(interviewId, actorId);

  const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (!interview.actualStartedAt) throw new ConflictError("This interview session hasn't started yet.");
  if (interview.actualEndedAt) throw new ConflictError("This interview session has already ended.");

  const now = new Date();
  const updated = await interviewRepo.applyActualEnd(interviewId, { actualEndedAt: now, actualEndedById: actorId });
  if (updated.count === 0) throw new ReviewConcurrencyError("This interview changed elsewhere — refresh and try again.");

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_SESSION_ENDED,
    entityType: "Interview",
    entityId: interviewId,
    metadata: {},
  });
}

export async function selectAdditionalQuestion(actorId: string, input: SelectAdditionalQuestionInput) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_SESSION_MANAGE);
  await assertActivePanelist(input.interviewId, actorId);

  const interview = await prisma.interview.findUnique({ where: { id: input.interviewId } });
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (!interview.actualStartedAt) throw new ConflictError("Start the interview session before selecting additional questions.");
  if (interview.actualEndedAt) throw new ConflictError("This interview session has ended and its questions can no longer be changed.");

  const question = await questionRepo.getQuestion(input.questionId);
  if (!question || question.cohortId !== interview.cohortId) throw new NotFoundError("That question doesn't exist.");
  if (question.category !== "ADDITIONAL_BANK") throw new ConflictError("Only bank questions may be selected as additional questions.");
  if (!question.isActive) throw new ConflictError("This question is no longer active.");

  // Interview Configuration §8D — one follow-up question per panellist, per interview.
  const alreadyAsked = await questionRepo.countAdditionalQuestionsAskedByPanelist(input.interviewId, actorId);
  if (alreadyAsked >= 1) {
    throw new ConflictError("You have already asked your one follow-up question for this interview.");
  }

  try {
    await questionRepo.createAskedRow(prisma, {
      interviewId: input.interviewId,
      questionId: input.questionId,
      askedByPanelistId: actorId,
    });
  } catch (error) {
    // P2002 = unique constraint violation — @@unique([interviewId, questionId]),
    // the concurrent-double-pick case (two panellists selecting the same
    // question at once). Everything else propagates unchanged.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("This question has already been asked in this interview.");
    }
    throw error;
  }

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_ADDITIONAL_QUESTION_SELECTED,
    entityType: "Interview",
    entityId: input.interviewId,
    metadata: { questionId: input.questionId },
  });
}
