import { afterAll, afterEach, describe, expect, it } from "vitest";

import { authorizeCredentials } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { AccountStatus, Role } from "@/lib/generated/prisma/enums";
import { createTestUser, testEmail, cleanupTestData } from "../helpers/db";

function fakeRequest() {
  return new Request("https://fms.pam-p.org/api/auth/callback/credentials", {
    headers: {
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "user-agent": "vitest-integration-suite",
    },
  });
}

async function latestLoginFailure(userIdOrEmail: { entityId?: string; email?: string }) {
  return prisma.auditLog.findFirst({
    where: {
      action: "USER_LOGIN_FAILED",
      ...(userIdOrEmail.entityId ? { entityId: userIdOrEmail.entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

describe("authorizeCredentials (Credentials provider authorize function)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("returns null and audits 'unknown_user' for an email with no matching account", async () => {
    const email = testEmail("nobody");

    const result = await authorizeCredentials({ email, password: "whatever12!A" }, fakeRequest());

    expect(result).toBeNull();
    const entry = await prisma.auditLog.findFirst({
      where: { action: "USER_LOGIN_FAILED", metadata: { path: ["email"], equals: email } },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
    expect((entry?.metadata as { reason?: string })?.reason).toBe("unknown_user");
    expect(entry?.ipAddress).toBe("203.0.113.7");
    expect(entry?.userAgent).toBe("vitest-integration-suite");
  });

  it("returns null and audits 'invalid_password' for a wrong password, without revealing which check failed", async () => {
    const { user } = await createTestUser({ status: AccountStatus.ACTIVE });

    const result = await authorizeCredentials(
      { email: user.email, password: "definitely-wrong-1!" },
      fakeRequest(),
    );

    expect(result).toBeNull();
    const entry = await latestLoginFailure({ entityId: user.id });
    expect((entry?.metadata as { reason?: string })?.reason).toBe("invalid_password");
  });

  it.each([AccountStatus.INACTIVE, AccountStatus.SUSPENDED, AccountStatus.LOCKED, AccountStatus.PENDING_ACTIVATION])(
    "returns null and audits 'account_not_active' for a %s account, even with the correct password",
    async (status) => {
      const { user, password } = await createTestUser({ status });

      const result = await authorizeCredentials({ email: user.email, password }, fakeRequest());

      expect(result).toBeNull();
      const entry = await latestLoginFailure({ entityId: user.id });
      expect((entry?.metadata as { reason?: string; status?: string })?.reason).toBe("account_not_active");
      expect((entry?.metadata as { reason?: string; status?: string })?.status).toBe(status);
    },
  );

  it("returns the user (without the password hash) for a valid, active login and writes no failure audit entry", async () => {
    const { user, password } = await createTestUser({ role: Role.APPLICATION_REVIEWER, status: AccountStatus.ACTIVE });

    const result = await authorizeCredentials({ email: user.email, password }, fakeRequest());

    expect(result).not.toBeNull();
    expect(result?.id).toBe(user.id);
    expect(result?.role).toBe(Role.APPLICATION_REVIEWER);
    expect(result).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(result)).not.toContain(user.passwordHash);

    const failureEntry = await latestLoginFailure({ entityId: user.id });
    expect(failureEntry).toBeNull();
  });

  it("treats a soft-deleted user identically to an unknown user", async () => {
    const { user, password } = await createTestUser({ status: AccountStatus.ACTIVE });
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const result = await authorizeCredentials({ email: user.email, password }, fakeRequest());

    expect(result).toBeNull();
    const entry = await latestLoginFailure({ entityId: user.id });
    expect(entry).toBeNull();
    const genericEntry = await prisma.auditLog.findFirst({
      where: { action: "USER_LOGIN_FAILED", metadata: { path: ["email"], equals: user.email } },
      orderBy: { createdAt: "desc" },
    });
    expect((genericEntry?.metadata as { reason?: string })?.reason).toBe("unknown_user");
  });
});
