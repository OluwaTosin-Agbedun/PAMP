"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { setFeatureFlag, type FeatureFlagKey } from "@/lib/featureFlags/service";

export type FeatureFlagActionResult = { success: true } | { error: string };

export async function setFeatureFlagAction(flag: FeatureFlagKey, enabled: boolean): Promise<FeatureFlagActionResult> {
  const session = await requireSession();
  try {
    await setFeatureFlag(flag, enabled, session.user.id);
    revalidatePath("/administration/feature-flags");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "featureFlags.set");
  }
}
