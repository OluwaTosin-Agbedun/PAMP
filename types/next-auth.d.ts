import type { Role } from "@/lib/rbac/roles";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
    /** Release 1.5 audit enhancement — a stable per-sign-in identifier,
     *  not persisted server-side (this codebase's JWT session strategy
     *  has no `Session` table to reference), used only to group audit
     *  rows by "which sign-in produced this." See lib/audit/context.ts. */
    sessionId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustChangePassword: boolean;
    sessionId: string;
  }
}
