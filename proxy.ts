import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth.config";

/**
 * Optimistic auth check on every request (Next.js 16 "Proxy", formerly
 * Middleware). Built from `authConfig` only — no providers, no database —
 * so it never queries Postgres on prefetched or static routes. Route
 * handlers, Server Actions, and Server Components still perform the
 * authoritative, database-verified check via `lib/permissions/guard.ts`.
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
