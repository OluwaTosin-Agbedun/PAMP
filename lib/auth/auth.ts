import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/lib/auth/auth.config";
import { authorizeCredentials } from "@/lib/auth/authorize";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/prisma";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
    // Register Microsoft Entra ID / Google Workspace providers here when
    // SSO is enabled — the `authorized`, `jwt`, and `session` callbacks
    // in auth.config.ts already handle any provider's session shape.
  ],
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      const now = new Date();
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: now },
        }),
        prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: AUDIT_ACTIONS.USER_LOGIN,
            entityType: "User",
            entityId: user.id,
          },
        }),
      ]);
    },
    async signOut(message) {
      const userId = "token" in message ? (message.token?.id as string | undefined) : undefined;
      if (!userId) return;
      await writeAuditLog({
        actorId: userId,
        action: AUDIT_ACTIONS.USER_LOGOUT,
        entityType: "User",
        entityId: userId,
      });
    },
  },
});
