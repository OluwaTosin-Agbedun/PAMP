import "server-only";

/**
 * Structured operational logging (§17) — deliberately separate from
 * lib/audit, which is the durable, queryable, append-only business
 * record. This is for operators reading stdout/a log aggregator, not
 * for "what happened to this application" screens.
 *
 * No external logging library: at this scale, a thin structured wrapper
 * over console output is the whole requirement (timestamp, severity,
 * operation, correlation ID, safe context) — pulling in a dependency
 * (pino/winston) for that would be exactly the "unnecessary complexity"
 * this project has consistently avoided elsewhere.
 */

type LogSeverity = "debug" | "info" | "warn" | "error";

const REDACTED = "[redacted]";

/** Defense-in-depth, not the primary control — call sites must not pass
 *  secrets in the first place. Strips any key that looks sensitive. */
const SENSITIVE_KEY_PATTERN = /password|passwordHash|token|secret|authorization|cookie/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val),
      ]),
    );
  }
  return value;
}

function write(severity: LogSeverity, operation: string, context?: Record<string, unknown>, correlationId?: string) {
  const entry = {
    timestamp: new Date().toISOString(),
    severity,
    operation,
    correlationId,
    ...(context ? { context: redact(context) } : {}),
  };

  const line = JSON.stringify(entry);
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (operation: string, context?: Record<string, unknown>, correlationId?: string) =>
    write("debug", operation, context, correlationId),
  info: (operation: string, context?: Record<string, unknown>, correlationId?: string) =>
    write("info", operation, context, correlationId),
  warn: (operation: string, context?: Record<string, unknown>, correlationId?: string) =>
    write("warn", operation, context, correlationId),
  error: (operation: string, context?: Record<string, unknown>, correlationId?: string) =>
    write("error", operation, context, correlationId),
};

/** One correlation ID per request/action, threaded into both logs and the audit trail. */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}
