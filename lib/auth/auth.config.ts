import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

import type { Role } from "@/lib/rbac/roles";

/**
 * Edge/Proxy-safe auth config: session shape and route-authorization
 * rules only — no providers, no database or bcrypt calls. This is what
 * `proxy.ts` runs on every request, so it must stay cheap (JWT-only,
 * optimistic checks).
 *
 * `auth.ts` spreads this config and adds the actual providers, so this
 * file is also where a future SSO provider (Microsoft Entra ID / Google
 * Workspace) would be reflected in the `authorized` callback, without
 * touching the credentials flow.
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnLogin = nextUrl.pathname === "/login";

      // No JWT-level mustChangePassword redirect here, deliberately: an
      // earlier version tried an "optimistic" version of this check
      // (redirect to /change-password straight from the proxy, using the
      // JWT's cached claim), but the claim goes stale in exactly the
      // window that matters most — immediately after signIn() or
      // unstable_update() sets a new session cookie, the very next
      // request's JWT can still reflect the old value, a same-request/
      // next-request cookie-propagation timing gap that isn't something
      // typecheck/lint/unit tests exercise (found via an end-to-end
      // Playwright run: a just-created account correctly redirected to
      // /change-password once, but a *subsequent* navigation bounced it
      // right back there even after the password had already been
      // changed and the database updated). The authoritative,
      // database-verified check — `requireUser` in
      // lib/permissions/guard.ts, which every dashboard page goes through
      // via app/(dashboard)/layout.tsx — already enforces this correctly
      // on every request without that staleness risk, so it's the sole
      // enforcement point. `app/(auth)/login/actions.ts` separately
      // chooses /change-password vs /dashboard as the *initial* landing
      // page straight from a fresh database read, for the same reason.
      if (isOnDashboard) {
        return isLoggedIn;
      }

      if (isOnLogin && isLoggedIn) {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        // Release 1.5 — one identifier per sign-in, minted once here
        // (not regenerated on every token refresh) so it stays stable
        // for a session's whole lifetime, matching how `token.id` works.
        token.sessionId = crypto.randomUUID();
      }
      // Server-side `unstable_update` call after a password change — see
      // app/(auth)/change-password/actions.ts. Keeps the JWT's
      // mustChangePassword claim in sync for the one place that still
      // reads it (the change-password page's forced-vs-voluntary copy);
      // no security check depends on this claim being fresh — see the
      // comment in the `authorized` callback above for why.
      if (trigger === "update" && session && typeof session === "object" && "mustChangePassword" in session) {
        token.mustChangePassword = Boolean((session as { mustChangePassword?: boolean }).mustChangePassword);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      session.sessionId = token.sessionId as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
