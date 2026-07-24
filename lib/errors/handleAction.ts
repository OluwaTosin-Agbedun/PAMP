import "server-only";

import { logger } from "@/lib/logging/logger";

import { AppError, InternalApplicationError } from "./AppError";

/**
 * Central error translation for Server Actions (§15). Every typed
 * AppError's own message is already safe to show a user — pass it
 * through. Anything else (a raw Prisma error, an unexpected exception)
 * is logged with full detail server-side and replaced with a generic
 * message — the client never sees a stack trace, a SQL error, or schema
 * detail.
 */
export function handleActionError(error: unknown, operation: string): { error: string } {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error(operation, { code: error.code, message: error.message });
    }
    return { error: error.message };
  }

  logger.error(operation, {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return { error: new InternalApplicationError().message };
}
