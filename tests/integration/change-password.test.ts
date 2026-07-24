import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn(),
  unstable_update: vi.fn(),
}));

import { changePasswordAction } from "@/app/(auth)/change-password/actions";
import { auth, unstable_update } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AccountStatus } from "@/lib/generated/prisma/enums";
import { cleanupTestData, createTestUser, TEST_PASSWORD } from "../helpers/db";

function actingAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);
}

function formDataFor(currentPassword: string, newPassword: string) {
  const formData = new FormData();
  formData.set("currentPassword", currentPassword);
  formData.set("newPassword", newPassword);
  return formData;
}

describe("changePasswordAction", () => {
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    vi.mocked(unstable_update).mockReset();
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("updates the password hash, clears mustChangePassword, refreshes the JWT, audits, and redirects to the dashboard", async () => {
    const { user } = await createTestUser({ mustChangePassword: true });
    actingAs(user.id);

    await expect(
      changePasswordAction(undefined, formDataFor(TEST_PASSWORD, "Brand-New-Pass9!")),
    ).rejects.toThrow(/^REDIRECT:\/dashboard/);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.passwordHash).not.toBe(user.passwordHash);
    expect(updated.mustChangePassword).toBe(false);

    expect(unstable_update).toHaveBeenCalledWith({ user: { mustChangePassword: false } });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "USER_PASSWORD_CHANGED", entityId: user.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain("Brand-New-Pass9!");
  });

  it("rejects an incorrect current password without changing the hash or writing an audit entry", async () => {
    const { user } = await createTestUser();
    actingAs(user.id);

    const result = await changePasswordAction(undefined, formDataFor("wrong-password!1A", "Brand-New-Pass9!"));

    expect(result?.error).toMatch(/current password is incorrect/i);

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.passwordHash).toBe(user.passwordHash);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "USER_PASSWORD_CHANGED", entityId: user.id },
    });
    expect(audit).toBeNull();
    expect(unstable_update).not.toHaveBeenCalled();
  });

  it("rejects a new password that doesn't meet the password policy", async () => {
    const { user } = await createTestUser();
    actingAs(user.id);

    const result = await changePasswordAction(undefined, formDataFor(TEST_PASSWORD, "weak"));

    expect(result?.error).toBeTruthy();
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.passwordHash).toBe(user.passwordHash);
  });

  it("rejects a new password identical to the current one", async () => {
    const { user } = await createTestUser();
    actingAs(user.id);

    const result = await changePasswordAction(undefined, formDataFor(TEST_PASSWORD, TEST_PASSWORD));

    expect(result?.error).toMatch(/different/i);
  });

  it("refuses the change for an account that is no longer active, even with the correct current password", async () => {
    const { user } = await createTestUser({ status: AccountStatus.SUSPENDED });
    actingAs(user.id);

    const result = await changePasswordAction(undefined, formDataFor(TEST_PASSWORD, "Brand-New-Pass9!"));

    expect(result?.error).toMatch(/not active/i);
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.passwordHash).toBe(user.passwordHash);
  });
});
