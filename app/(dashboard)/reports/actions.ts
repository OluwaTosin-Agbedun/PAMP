"use server";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { exportAnalyticsCsv } from "@/modules/analytics/services/analyticsService";
import { exportAnalyticsSchema } from "@/modules/analytics/validation/schemas";

export type ExportAnalyticsResult = { success: true; csv: string } | { error: string };

export async function exportAnalyticsAction(input: unknown): Promise<ExportAnalyticsResult> {
  const session = await requireSession();
  try {
    const parsed = exportAnalyticsSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const { cohortId, ...filters } = parsed.data;
    const csv = await exportAnalyticsCsv(session.user.id, cohortId, filters);
    return { success: true, csv };
  } catch (error) {
    return handleActionError(error, "analytics.export");
  }
}
