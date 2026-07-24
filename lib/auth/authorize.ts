import "server-only";

import bcrypt from "bcryptjs";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/prisma";
import { newCorrelationId } from "@/lib/logging/logger";
import type { Role } from "@/lib/rbac/roles";
import { loginSchema } from "@/lib/validation/auth";

export function requestMetadata(request: Request | undefined) {
  if (!request) return { ipAddress: undefined, userAgent: undefined };
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}

export type AuthorizedCredentialsUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};

/**
 * The Credentials provider's `authorize` function, extracted so it can be
 * exercised directly in integration tests (see tests/integration/auth.test.ts)
 * without going through NextAuth's full HTTP flow.
 *
 * Every failure path returns the same generic `null` to the caller
 * ("Invalid email or password" in the UI) to avoid account-status/
 * enumeration signals — the *specific* reason is only ever visible via
 * the audit trail.
 */
export async function authorizeCredentials(
  rawCredentials: unknown,
  request: Request | undefined,
): Promise<AuthorizedCredentialsUser | null> {
  const correlationId = newCorrelationId();
  const { ipAddress, userAgent } = requestMetadata(request);

  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.deletedAt) {
    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entityType: "User",
      metadata: { email, reason: "unknown_user" },
      ipAddress,
      userAgent,
      correlationId,
    });
    return null;
  }

  if (user.status !== "ACTIVE") {
    await writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "account_not_active", status: user.status },
      ipAddress,
      userAgent,
      correlationId,
    });
    return null;
  }

  const passwordsMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordsMatch) {
    await writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "invalid_password" },
      ipAddress,
      userAgent,
      correlationId,
    });
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}
