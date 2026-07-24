"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import {
  createQuestion,
  setQuestionActive,
  updateQuestion,
} from "@/modules/interviews/services/interviewQuestionService";
import {
  createInterviewQuestionSchema,
  setInterviewQuestionActiveSchema,
  updateInterviewQuestionSchema,
} from "@/modules/interviews/validation/schemas";

/**
 * Server Actions for the interview question bank (Addendum Module 3) —
 * thin delegates to interviewQuestionService, same shape as
 * eligibility-criteria/actions.ts's create/toggle pair, but calling
 * through the service/repository layers rather than prisma.* directly
 * (this module follows Modules 1/2's newer layered pattern).
 */

export type QuestionFormState = { error?: string; success?: boolean };

export async function createQuestionAction(
  _prevState: QuestionFormState | undefined,
  formData: FormData,
): Promise<QuestionFormState> {
  const session = await requireSession();

  const parsed = createInterviewQuestionSchema.safeParse({
    text: formData.get("text"),
    category: formData.get("category"),
    pathway: formData.get("pathway") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createQuestion(session.user.id, parsed.data);
  } catch (error) {
    return handleActionError(error, "interviews.questions.create");
  }

  revalidatePath("/interviews/questions");
  return { success: true };
}

export async function updateQuestionAction(
  _prevState: QuestionFormState | undefined,
  formData: FormData,
): Promise<QuestionFormState> {
  const session = await requireSession();

  const parsed = updateInterviewQuestionSchema.safeParse({
    questionId: formData.get("questionId"),
    text: formData.get("text"),
    category: formData.get("category"),
    pathway: formData.get("pathway") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await updateQuestion(session.user.id, parsed.data);
  } catch (error) {
    return handleActionError(error, "interviews.questions.update");
  }

  revalidatePath("/interviews/questions");
  return { success: true };
}

export async function setQuestionActiveAction(questionId: string, isActive: boolean) {
  const session = await requireSession();
  const parsed = setInterviewQuestionActiveSchema.parse({ questionId, isActive });
  await setQuestionActive(session.user.id, parsed);
  revalidatePath("/interviews/questions");
}
