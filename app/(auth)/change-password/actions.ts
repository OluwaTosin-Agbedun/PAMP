"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { unstable_update } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/permissions/guard";
import { getChangePasswordSchema } from "@/lib/validation/auth";

export type ChangePasswordState = { error?: string };

/**
 * Uses requireSession (JWT-only), not requireUser — this page is itself
 * the mustChangePassword redirect target, and requireUser would redirect
 * back here, looping (see lib/permissions/guard.ts).
 */
export async function changePasswordAction(
  _prevState: ChangePasswordState | undefined,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await requireSession();

  const changePasswordSchema = await getChangePasswordSchema();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    return { error: "This account is not active. Contact your System Administrator." };
  }

  const currentMatches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentMatches) {
    return { error: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  await writeAuditLog({
    actorId: user.id,
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
    entityType: "User",
    entityId: user.id,
  });

  // Refresh the JWT's mustChangePassword claim in place — otherwise the
  // proxy's optimistic (JWT-only) check would keep bouncing the user back
  // here until their token naturally refreshes at next sign-in.
  await unstable_update({ user: { mustChangePassword: false } });

  redirect("/dashboard");
}
