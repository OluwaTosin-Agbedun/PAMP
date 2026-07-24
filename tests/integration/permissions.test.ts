import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  AccountInactiveError,
  AccountLockedError,
  AuthenticationError,
  AuthorisationError,
} from "@/lib/errors";
import { AccountStatus, Role } from "@/lib/generated/prisma/enums";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import {
  getAuthorizedUser,
  getUserPermissions,
  getUserRoles,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  requirePermission,
} from "@/lib/permissions/service";
import { cleanupTestData, createTestUser } from "../helpers/db";

describe("permission service (DB-verified authorization)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("returns null for a user id that doesn't exist", async () => {
    expect(await getAuthorizedUser("does-not-exist")).toBeNull();
  });

  it("returns null for a soft-deleted user", async () => {
    const { user } = await createTestUser({ status: AccountStatus.ACTIVE });
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    expect(await getAuthorizedUser(user.id)).toBeNull();
    expect(await getUserPermissions(user.id)).toEqual([]);
  });

  it("getUserRoles reflects the user's current role", async () => {
    const { user } = await createTestUser({ role: Role.INTERVIEWER });
    expect(await getUserRoles(user.id)).toEqual([Role.INTERVIEWER]);
  });

  it("getUserPermissions is empty for any non-ACTIVE status, regardless of role", async () => {
    const { user } = await createTestUser({ role: Role.SYSTEM_ADMIN, status: AccountStatus.SUSPENDED });
    expect(await getUserPermissions(user.id)).toEqual([]);
    expect(await hasPermission(user.id, PERMISSIONS.USERS_VIEW)).toBe(false);
  });

  it("hasPermission / hasAnyPermission / hasAllPermissions agree with the role's permission set", async () => {
    const { user } = await createTestUser({ role: Role.APPLICATION_REVIEWER, status: AccountStatus.ACTIVE });

    expect(await hasPermission(user.id, PERMISSIONS.REVIEWS_PERFORM)).toBe(true);
    expect(await hasPermission(user.id, PERMISSIONS.USERS_VIEW)).toBe(false);

    expect(await hasAnyPermission(user.id, [PERMISSIONS.USERS_VIEW, PERMISSIONS.REVIEWS_PERFORM])).toBe(true);
    expect(await hasAnyPermission(user.id, [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_CREATE])).toBe(false);

    expect(
      await hasAllPermissions(user.id, [PERMISSIONS.APPLICATIONS_VIEW, PERMISSIONS.REVIEWS_PERFORM]),
    ).toBe(true);
    expect(
      await hasAllPermissions(user.id, [PERMISSIONS.APPLICATIONS_VIEW, PERMISSIONS.USERS_VIEW]),
    ).toBe(false);
  });

  it("a role change takes effect on the very next check — no stale caching across requests", async () => {
    const { user } = await createTestUser({ role: Role.APPLICATION_REVIEWER, status: AccountStatus.ACTIVE });

    expect(await hasPermission(user.id, PERMISSIONS.USERS_VIEW)).toBe(false);

    await prisma.user.update({ where: { id: user.id }, data: { role: Role.SYSTEM_ADMIN } });

    expect(await hasPermission(user.id, PERMISSIONS.USERS_VIEW)).toBe(true);
  });

  it("a status change (deactivation) takes effect on the very next check", async () => {
    const { user } = await createTestUser({ role: Role.SYSTEM_ADMIN, status: AccountStatus.ACTIVE });
    expect(await hasPermission(user.id, PERMISSIONS.USERS_VIEW)).toBe(true);

    await prisma.user.update({ where: { id: user.id }, data: { status: AccountStatus.SUSPENDED } });

    expect(await hasPermission(user.id, PERMISSIONS.USERS_VIEW)).toBe(false);
  });

  describe("requirePermission", () => {
    it("throws AuthenticationError for a user id that doesn't exist", async () => {
      await expect(requirePermission("does-not-exist", PERMISSIONS.USERS_VIEW)).rejects.toBeInstanceOf(
        AuthenticationError,
      );
    });

    it("throws AccountLockedError for a locked account", async () => {
      const { user } = await createTestUser({ status: AccountStatus.LOCKED });
      await expect(requirePermission(user.id, PERMISSIONS.APPLICATIONS_VIEW)).rejects.toBeInstanceOf(
        AccountLockedError,
      );
    });

    it("throws AccountInactiveError for an inactive (non-locked) account", async () => {
      const { user } = await createTestUser({ status: AccountStatus.SUSPENDED });
      await expect(requirePermission(user.id, PERMISSIONS.APPLICATIONS_VIEW)).rejects.toBeInstanceOf(
        AccountInactiveError,
      );
    });

    it("throws AuthorisationError for an active user lacking the permission", async () => {
      const { user } = await createTestUser({ role: Role.FELLOW, status: AccountStatus.ACTIVE });
      await expect(requirePermission(user.id, PERMISSIONS.USERS_VIEW)).rejects.toBeInstanceOf(
        AuthorisationError,
      );
    });

    it("resolves with the authorized user when the permission is granted", async () => {
      const { user } = await createTestUser({ role: Role.SYSTEM_ADMIN, status: AccountStatus.ACTIVE });
      const authorized = await requirePermission(user.id, PERMISSIONS.USERS_VIEW);
      expect(authorized.id).toBe(user.id);
    });
  });
});
