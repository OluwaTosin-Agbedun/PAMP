import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AuditAction } from "./actions";
import { getAuditContext } from "./context";

export async function writeAuditLog(entry: {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  /** Previous/new value, reason/comment — anything display-only lives
   *  here rather than as dedicated columns (see docs/AUDIT_LOGGING.md).
   *  Never put passwords, hashes, tokens, or secrets in this object. */
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  programmeId?: string;
  cohortId?: string;
  correlationId?: string;
  requestId?: string;
  sessionId?: string;
}) {
  // Release 1.5: every field below falls back to the current request's
  // AuditContext (lib/audit/context.ts) when the caller doesn't pass it
  // explicitly — so the ~15 existing call sites across every module
  // needed no changes to start recording correlationId/requestId/
  // sessionId/ipAddress/userAgent; an explicit value on the entry itself
  // still wins, for the rare case a caller genuinely knows better (e.g.
  // a background/system-initiated write with no request at all).
  const context = getAuditContext();

  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: entry.ipAddress ?? context?.ipAddress,
      userAgent: entry.userAgent ?? context?.userAgent,
      programmeId: entry.programmeId,
      cohortId: entry.cohortId,
      correlationId: entry.correlationId ?? context?.correlationId,
      requestId: entry.requestId ?? context?.requestId,
      sessionId: entry.sessionId ?? context?.sessionId,
    },
  });
}
