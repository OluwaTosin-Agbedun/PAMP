import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { newCorrelationId } from "@/lib/logging/logger";

/**
 * Release 1.5 §"Audit Enhancement" — "Every multi-step action must
 * share the same Correlation ID." `AuditLog` already had a
 * `correlationId` column (Phase 2), but nothing ever populated it; this
 * is the piece that actually threads one through, using
 * `AsyncLocalStorage` (the same primitive Next's own `headers()`/
 * `cookies()` are built on) so every `writeAuditLog` call within one
 * request/Server Action picks it up automatically — no call site
 * changes needed at any of the ~15 places `writeAuditLog` is already
 * called.
 */
export type AuditContext = {
  correlationId: string;
  requestId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
};

const storage = new AsyncLocalStorage<AuditContext>();

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}

/**
 * Idempotent within one request: the first guard function to run in a
 * given Server Action/Server Component render establishes the context;
 * any other guard called later in the same request (e.g.
 * `requireSession` followed by a service's own `requirePermission`)
 * reuses it rather than minting a second `correlationId`/`requestId`.
 */
export function ensureAuditContext(overrides?: Partial<AuditContext>): AuditContext {
  const existing = storage.getStore();
  if (existing) return existing;

  const context: AuditContext = {
    correlationId: newCorrelationId(),
    requestId: newCorrelationId(),
    ...overrides,
  };
  storage.enterWith(context);
  return context;
}
