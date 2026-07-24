import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { InterviewQuestionCategory, Prisma } from "@/lib/generated/prisma/client";

/**
 * Pure data access for InterviewQuestion/InterviewQuestionAsked — no
 * business rules, no permission checks, no audit writes. Mirrors
 * panelistRepository.ts's shape.
 */

export function listQuestionsForCohort(cohortId: string, category?: InterviewQuestionCategory) {
  return prisma.interviewQuestion.findMany({
    where: { cohortId, ...(category ? { category } : {}) },
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
}

export function listActiveQuestionsForCohort(cohortId: string) {
  return prisma.interviewQuestion.findMany({
    where: { cohortId, isActive: true },
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
}

export function getQuestion(id: string) {
  return prisma.interviewQuestion.findUnique({ where: { id } });
}

export function createQuestion(data: Prisma.InterviewQuestionUncheckedCreateInput) {
  return prisma.interviewQuestion.create({ data });
}

export function updateQuestion(id: string, data: Prisma.InterviewQuestionUncheckedUpdateInput) {
  return prisma.interviewQuestion.update({ where: { id }, data });
}

/** Whether this question has ever been asked in any interview — the historical-integrity lock check. */
export async function hasBeenAsked(questionId: string): Promise<boolean> {
  const count = await prisma.interviewQuestionAsked.count({ where: { questionId } });
  return count > 0;
}

/** Every questionId with ≥1 ask record, scoped to a cohort — for the admin bank page's locked-state display. */
export async function listAskedQuestionIdsForCohort(cohortId: string): Promise<Set<string>> {
  const rows = await prisma.interviewQuestionAsked.findMany({
    where: { question: { cohortId } },
    select: { questionId: true },
    distinct: ["questionId"],
  });
  return new Set(rows.map((r) => r.questionId));
}

export function listAskedForInterview(interviewId: string) {
  return prisma.interviewQuestionAsked.findMany({
    where: { interviewId },
    include: {
      question: true,
      askedByPanelist: { select: { id: true, name: true } },
    },
    orderBy: { askedAt: "asc" },
  });
}

/** Interview Configuration §8D — "each panellist may ask a maximum of one follow-up question." Scoped to ADDITIONAL_BANK specifically, since MANDATORY/PATHWAY/SITUATIONAL rows are auto-recorded and attributed to whichever panellist started the session, not a genuine per-panellist pick. */
export async function countAdditionalQuestionsAskedByPanelist(interviewId: string, panelistId: string): Promise<number> {
  return prisma.interviewQuestionAsked.count({
    where: { interviewId, askedByPanelistId: panelistId, question: { category: "ADDITIONAL_BANK" } },
  });
}

export function createAskedRow(
  tx: Prisma.TransactionClient | typeof prisma,
  data: { interviewId: string; questionId: string; askedByPanelistId: string },
) {
  return tx.interviewQuestionAsked.create({ data });
}

/** Bulk variant for the auto-recorded mandatory/pathway set at session start. */
export function createManyAskedRows(
  tx: Prisma.TransactionClient,
  rows: { interviewId: string; questionId: string; askedByPanelistId: string }[],
) {
  return tx.interviewQuestionAsked.createMany({ data: rows, skipDuplicates: true });
}
