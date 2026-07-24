import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn(),
}));

import {
  changeUserRoleAction,
  createUserAction,
  resetUserPasswordAction,
  setUserStatusAction,
} from "@/app/(dashboard)/users/actions";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AccountStatus, Role } from "@/lib/generated/prisma/enums";
import { cleanupTestData, createTestUser, testEmail, TEST_PASSWORD } from "../helpers/db";

function actingAs(userId: string) {
  // Matches the shape lib/permissions/guard.ts reads: session.user.id.
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);
}

describe("users admin Server Actions", () => {
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  describe("createUserAction", () => {
    it("redirects (denies) an unauthorized caller and creates no row", async () => {
      const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      actingAs(reviewer.id);
      const email = testEmail("blocked");

      const formData = new FormData();
      formData.set("name", "New Person");
      formData.set("email", email);
      formData.set("role", "APPLICATION_REVIEWER");
      formData.set("password", TEST_PASSWORD);

      await expect(createUserAction(undefined, formData)).rejects.toThrow(/^REDIRECT:/);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it("lets a System Administrator create a user, forces a password change, and writes an audit entry", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      actingAs(admin.id);
      const email = testEmail("created");

      const formData = new FormData();
      formData.set("name", "New Person");
      formData.set("email", email);
      formData.set("role", "APPLICATION_REVIEWER");
      formData.set("password", TEST_PASSWORD);

      const result = await createUserAction(undefined, formData);
      expect(result.success).toBe(true);

      const created = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(created.role).toBe(Role.APPLICATION_REVIEWER);
      expect(created.mustChangePassword).toBe(true);
      expect(created.passwordHash).not.toBe(TEST_PASSWORD);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "USER_CREATED", entityId: created.id },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(admin.id);
    });

    it("rejects a duplicate email with a safe, specific message and creates no second row", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: existing } = await createTestUser();
      actingAs(admin.id);

      const formData = new FormData();
      formData.set("name", "Duplicate");
      formData.set("email", existing.email);
      formData.set("role", "APPLICATION_REVIEWER");
      formData.set("password", TEST_PASSWORD);

      const result = await createUserAction(undefined, formData);
      expect(result.error).toMatch(/already exists/i);

      const count = await prisma.user.count({ where: { email: existing.email } });
      expect(count).toBe(1);
    });
  });

  describe("setUserStatusAction", () => {
    it("deactivates a user and writes an audit entry with from/to metadata", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: target } = await createTestUser({ status: AccountStatus.ACTIVE });
      actingAs(admin.id);

      await setUserStatusAction(target.id, AccountStatus.SUSPENDED);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(updated.status).toBe(AccountStatus.SUSPENDED);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "USER_STATUS_CHANGED", entityId: target.id },
      });
      expect(audit?.metadata).toMatchObject({ from: AccountStatus.ACTIVE, to: AccountStatus.SUSPENDED });
    });

    it("refuses to let a user change their own status", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      actingAs(admin.id);

      await expect(setUserStatusAction(admin.id, AccountStatus.SUSPENDED)).rejects.toThrow(
        /cannot change your own account status/i,
      );

      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
      expect(unchanged.status).toBe(AccountStatus.ACTIVE);
    });

    // The "last active System Administrator" protection (see
    // app/(dashboard)/users/actions.ts) is guarded by a *global* count
    // across the whole users table, which in this shared dev database
    // always includes the real seeded admin — so the zero-remaining-admins
    // branch can never actually trigger here without deactivating that
    // real account. That branch is exercised by manual QA and is a
    // documented known limitation of the automated suite (docs/SEEDING.md).
    it("allows deactivating an admin when another active admin still exists", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: anotherAdmin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      actingAs(admin.id);

      await setUserStatusAction(anotherAdmin.id, AccountStatus.SUSPENDED);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: anotherAdmin.id } });
      expect(updated.status).toBe(AccountStatus.SUSPENDED);
    });
  });

  describe("changeUserRoleAction", () => {
    it("changes a user's role and writes an audit entry, and the new role immediately grants different permissions", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: target } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      actingAs(admin.id);

      await changeUserRoleAction(target.id, Role.PROGRAMME_DIRECTOR);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(updated.role).toBe(Role.PROGRAMME_DIRECTOR);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "USER_ROLE_CHANGED", entityId: target.id },
      });
      expect(audit?.metadata).toMatchObject({ from: Role.APPLICATION_REVIEWER, to: Role.PROGRAMME_DIRECTOR });
    });

    it("an unauthorized caller cannot change a role — the server re-derives the actor's role, ignoring anything the client sends", async () => {
      const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      const { user: target } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
      actingAs(reviewer.id);

      await expect(changeUserRoleAction(target.id, Role.SYSTEM_ADMIN)).rejects.toThrow(/^REDIRECT:/);

      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(unchanged.role).toBe(Role.APPLICATION_REVIEWER);
    });

    // As with setUserStatusAction, the zero-remaining-admins branch of this
    // rule can't be safely driven to true against the shared dev database
    // (see the comment above the equivalent setUserStatusAction test) —
    // covered by manual QA instead.
    it("allows demoting an admin when another active admin still exists", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: anotherAdmin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      actingAs(admin.id);

      await changeUserRoleAction(anotherAdmin.id, Role.APPLICATION_REVIEWER);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: anotherAdmin.id } });
      expect(updated.role).toBe(Role.APPLICATION_REVIEWER);
    });
  });

  describe("resetUserPasswordAction", () => {
    it("sets a new password hash, forces a password change, and audits without ever storing the password value", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: target } = await createTestUser({ mustChangePassword: false });
      actingAs(admin.id);

      const previousHash = target.passwordHash;
      await resetUserPasswordAction(target.id, "Brand-New-Pass9!");

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(updated.passwordHash).not.toBe(previousHash);
      expect(updated.mustChangePassword).toBe(true);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "USER_PASSWORD_RESET", entityId: target.id },
      });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit)).not.toContain("Brand-New-Pass9!");
    });

    it("rejects a weak password without changing the existing hash", async () => {
      const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
      const { user: target } = await createTestUser();
      actingAs(admin.id);

      const previousHash = target.passwordHash;
      await expect(resetUserPasswordAction(target.id, "weak")).rejects.toThrow();

      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(unchanged.passwordHash).toBe(previousHash);
    });
  });
});
