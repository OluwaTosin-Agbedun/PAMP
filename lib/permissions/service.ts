import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db/prisma";
import { AccountInactiveError, AccountLockedError, AuthenticationError, AuthorisationError } from "@/lib/errors";
import type { Role } from "@/lib/rbac/roles";

import type { Permission } from "./catalog";
import { permissionsForRole } from "./rolePermissions";

export type AuthorizedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING_ACTIVATION" | "LOCKED";
  mustChangePassword: boolean;
};

/**
 * The one authoritative source for "who is this user, right now." Reads
 * fresh from the database rather than trusting the session/JWT's cached
 * role and status — a role change or deactivation this way takes effect
 * on the very next request, not whenever the JWT happens to refresh
 * (§19: "session invalidation or access denial following account
 * deactivation"). `proxy.ts` still does a cheap JWT-only check for
 * optimistic route protection; this is what actually decides access.
 * Cached per-request (React `cache()`) so multiple permission checks in
 * one request cost one query, not N.
 */
export const getAuthorizedUser = cache(async (userId: string): Promise<AuthorizedUser | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      mustChangePassword: true,
      deletedAt: true,
    },
  });
  if (!user || user.deletedAt) return null;
  return user;
});

export async function getUserRoles(userId: string): Promise<Role[]> {
  const user = await getAuthorizedUser(userId);
  return user ? [user.role] : [];
}

/** Empty for any non-ACTIVE account, regardless of role — status always wins. */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const user = await getAuthorizedUser(userId);
  if (!user || user.status !== "ACTIVE") return [];
  return permissionsForRole(user.role);
}

export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  const granted = await getUserPermissions(userId);
  return granted.includes(permission);
}

export async function hasAnyPermission(userId: string, permissions: Permission[]): Promise<boolean> {
  const granted = await getUserPermissions(userId);
  return permissions.some((permission) => granted.includes(permission));
}

export async function hasAllPermissions(userId: string, permissions: Permission[]): Promise<boolean> {
  const granted = await getUserPermissions(userId);
  return permissions.every((permission) => granted.includes(permission));
}

/** Throws a typed AppError rather than returning a boolean — for Server
 *  Actions and services that want to fail loudly and let
 *  handleActionError translate it, rather than branch on a boolean. */
export async function requirePermission(userId: string, permission: Permission): Promise<AuthorizedUser> {
  const user = await getAuthorizedUser(userId);
  if (!user) {
    throw new AuthenticationError();
  }
  if (user.status !== "ACTIVE") {
    throw user.status === "LOCKED" ? new AccountLockedError() : new AccountInactiveError();
  }
  if (!permissionsForRole(user.role).includes(permission)) {
    throw new AuthorisationError(`Missing permission: ${permission}`);
  }
  return user;
}
