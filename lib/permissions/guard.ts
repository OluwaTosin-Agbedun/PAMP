import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth/auth";
import { ensureAuditContext } from "@/lib/audit/context";

import type { Permission } from "./catalog";
import { permissionsForRole } from "./rolePermissions";
import { getAuthorizedUser, type AuthorizedUser } from "./service";

/**
 * Release 1.5 — establishes this request's AuditContext (correlation/
 * request ID, IP, user agent, session ID) once, the first time any
 * guard runs. `requireSession` is the near-universal entry point every
 * authenticated page/action passes through, so this is the one place
 * that needs to call it — `writeAuditLog` picks the context up
 * automatically from there (see lib/audit/context.ts).
 *
 * `next/headers`' `headers()` throws outside a real App Router request
 * scope — true in this codebase's integration tests, which call a
 * Server Action's exported function directly rather than through an
 * actual HTTP request. Falls back to no IP/user agent there, matching
 * the audit schema's own "IP Address (where available)" — a real
 * request always has one; a direct function call in a test genuinely
 * doesn't, and that's not an error to surface.
 */
async function establishAuditContext(sessionId: string | undefined) {
  let ipAddress: string | undefined;
  let userAgent: string | undefined;
  try {
    const headersList = await headers();
    ipAddress = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    userAgent = headersList.get("user-agent") ?? undefined;
  } catch {
    // Not in a real request scope (e.g. a test calling a Server Action
    // directly) — leave both undefined.
  }
  ensureAuditContext({ ipAddress, userAgent, sessionId });
}

/**
 * Page-level guards for Server Components — redirect on failure, the
 * standard Next.js UX for a full navigation (§10: "redirect
 * unauthenticated users to the sign-in page"). Server Actions use
 * `requirePermission` from ./service instead, which throws a typed
 * AppError for `handleActionError` to translate — a redirect isn't
 * meaningful for an in-page mutation.
 */

/** Session existence only — cheap, JWT-based, matches proxy.ts's optimism. */
export const requireSession = cache(async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  await establishAuditContext(session.sessionId);
  return session;
});

/**
 * The authoritative "who is allowed to be here" check for a page —
 * fresh from the database, not the cached JWT (§19: a deactivation or
 * role change takes effect on the very next request). Also enforces the
 * forced password-change flow. Do not call this from the change-password
 * page itself — use `requireSession` there instead, or this redirects
 * to itself.
 */
export const requireUser = cache(async (): Promise<AuthorizedUser> => {
  const session = await requireSession();
  const user = await getAuthorizedUser(session.user.id);
  if (!user) {
    redirect("/login");
  }
  if (user.status !== "ACTIVE") {
    redirect("/access-denied?reason=account_inactive");
  }
  if (user.mustChangePassword) {
    redirect("/change-password");
  }
  return user;
});

export async function requirePagePermission(permission: Permission): Promise<AuthorizedUser> {
  const user = await requireUser();
  if (!permissionsForRole(user.role).includes(permission)) {
    redirect("/access-denied?reason=forbidden");
  }
  return user;
}

export async function requireAnyPagePermission(permissions: Permission[]): Promise<AuthorizedUser> {
  const user = await requireUser();
  const granted = permissionsForRole(user.role);
  if (!permissions.some((permission) => granted.includes(permission))) {
    redirect("/access-denied?reason=forbidden");
  }
  return user;
}

/**
 * Defense-in-depth check inside a Server Action whose page is already
 * permission-gated — mirrors requirePagePermission's redirect UX (the
 * same pattern Sequence 1's requireAction/requireRole used). For actions
 * that should report an authorization failure inline instead (e.g. a
 * user changing their own password), use `requirePermission` from
 * ./service and catch it with handleActionError.
 */
export async function requireActionPermission(permission: Permission): Promise<AuthorizedUser> {
  const session = await requireSession();
  const user = await getAuthorizedUser(session.user.id);
  if (!user || user.status !== "ACTIVE") {
    redirect("/access-denied?reason=account_inactive");
  }
  if (!permissionsForRole(user.role).includes(permission)) {
    redirect("/access-denied?reason=forbidden");
  }
  return user;
}

/** For Route Handlers, which need a Response instead of a redirect (§10). */
export async function requirePermissionApi(permission: Permission) {
  const session = await auth();
  if (!session?.user) {
    return { user: null, response: new Response(null, { status: 401 }) } as const;
  }
  const user = await getAuthorizedUser(session.user.id);
  if (!user || user.status !== "ACTIVE") {
    return { user: null, response: new Response(null, { status: 403 }) } as const;
  }
  if (!permissionsForRole(user.role).includes(permission)) {
    return { user: null, response: new Response(null, { status: 403 }) } as const;
  }
  await establishAuditContext(session.sessionId);
  return { user, response: null } as const;
}
