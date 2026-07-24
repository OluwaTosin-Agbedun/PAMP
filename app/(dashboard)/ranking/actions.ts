"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import {
  approveFinalRanking,
  generateFinalRanking,
  reopenFinalRanking,
  resolveTie,
} from "@/modules/ranking/services/rankingService";
import { exportRankingCsv } from "@/modules/ranking/services/rankingWorkspaceService";
import {
  approveFinalRankingSchema,
  generateFinalRankingSchema,
  reopenFinalRankingSchema,
  resolveTieSchema,
} from "@/modules/ranking/validation/schemas";

export type RankingActionResult = { success: true } | { error: string };

export async function generateFinalRankingAction(input: unknown): Promise<RankingActionResult> {
  const session = await requireSession();
  try {
    const parsed = generateFinalRankingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await generateFinalRanking(session.user.id, parsed.data);
    revalidatePath("/ranking");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "ranking.generate");
  }
}

export async function approveFinalRankingAction(input: unknown): Promise<RankingActionResult> {
  const session = await requireSession();
  try {
    const parsed = approveFinalRankingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await approveFinalRanking(session.user.id, parsed.data);
    revalidatePath("/ranking");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "ranking.approve");
  }
}

export async function reopenFinalRankingAction(input: unknown): Promise<RankingActionResult> {
  const session = await requireSession();
  try {
    const parsed = reopenFinalRankingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await reopenFinalRanking(session.user.id, parsed.data);
    revalidatePath("/ranking");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "ranking.reopen");
  }
}

export async function resolveTieAction(input: unknown): Promise<RankingActionResult> {
  const session = await requireSession();
  try {
    const parsed = resolveTieSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await resolveTie(session.user.id, parsed.data);
    revalidatePath("/ranking");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "ranking.resolveTie");
  }
}

export type ExportRankingResult = { success: true; csv: string } | { error: string };

export async function exportRankingCsvAction(cohortId: string): Promise<ExportRankingResult> {
  const session = await requireSession();
  try {
    const csv = await exportRankingCsv(session.user.id, cohortId);
    return { success: true, csv };
  } catch (error) {
    return handleActionError(error, "ranking.export");
  }
}
