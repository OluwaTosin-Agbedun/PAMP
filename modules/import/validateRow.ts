import { z } from "zod";

export const mappedRowSchema = z.object({
  externalRef: z.string().trim().optional(),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  phone: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  dateOfBirth: z.string().trim().optional(),
  stateOfOrigin: z.string().trim().optional(),
  institution: z.string().trim().optional(),
  pathway: z.string().trim().optional(),
  nationality: z.string().trim().optional(),
  governmentIdType: z.string().trim().optional(),
  governmentIdNumber: z.string().trim().optional(),
  nyscStatus: z.string().trim().optional(),
  nyscCompletionDate: z.string().trim().optional(),
  availabilityDeclared: z.string().trim().optional(),
  submittedAt: z.string().trim().optional(),
});

export type MappedRow = z.infer<typeof mappedRowSchema>;

const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

/**
 * A bare `new Date(str)` on a slash-separated date is ambiguous and, for
 * this Nigerian-locale export, actively wrong: JS reads `05/06/2026` as
 * MM/DD (5 June silently becomes 6 May), and rejects `29/06/2026`
 * outright since 29 isn't a valid month. Every slash-separated date this
 * import pipeline sees is day-first (`DD/MM/YYYY`, `D/M/YY`, etc.) — the
 * cohort's real export uses no other slash format — so that shape is
 * parsed explicitly rather than left to the platform's ambiguous
 * built-in parsing. Anything else (ISO strings, spelled-out dates) is
 * unambiguous already and goes through `new Date` unchanged.
 */
function parseDate(value: string | undefined, label: string): { date: Date | null; error?: string } {
  if (!value) return { date: null };
  const trimmed = value.trim();

  const slashMatch = trimmed.match(SLASH_DATE);
  if (slashMatch) {
    const [, dayStr, monthStr, yearStr] = slashMatch;
    const day = Number.parseInt(dayStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const year = yearStr.length === 2 ? 2000 + Number.parseInt(yearStr, 10) : Number.parseInt(yearStr, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { date: null, error: `Could not parse ${label} "${value}"` };
    }
    const parsed = new Date(Date.UTC(year, month - 1, day));
    // Catches day-of-month overflow the range check above can't (e.g. 31/04).
    if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      return { date: null, error: `Could not parse ${label} "${value}"` };
    }
    return { date: parsed };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, error: `Could not parse ${label} "${value}"` };
  }
  return { date: parsed };
}

export function parseDateOfBirth(value: string | undefined): { date: Date | null; error?: string } {
  return parseDate(value, "date of birth");
}

/** §6.4 the five-year rule needs an exact date — an unparseable value is surfaced, never silently dropped. */
export function parseNyscCompletionDate(value: string | undefined): { date: Date | null; error?: string } {
  return parseDate(value, "NYSC completion date");
}

export function parseSubmittedAt(value: string | undefined): { date: Date | null; error?: string } {
  return parseDate(value, "submission timestamp");
}

const NYSC_STATUS_ALIASES: Record<string, "COMPLETED" | "CURRENTLY_SERVING" | "EXEMPTED" | "EXCLUDED"> = {
  completed: "COMPLETED",
  discharged: "COMPLETED",
  "discharge certificate": "COMPLETED",
  "currently serving": "CURRENTLY_SERVING",
  serving: "CURRENTLY_SERVING",
  "in progress": "CURRENTLY_SERVING",
  // Registered for NYSC but not yet deployed — not yet post-NYSC, same as
  // "currently serving" for eligibility purposes (the five-year rule
  // doesn't apply to either).
  "awaiting call-up": "CURRENTLY_SERVING",
  "awaiting call up": "CURRENTLY_SERVING",
  exempted: "EXEMPTED",
  exemption: "EXEMPTED",
  excluded: "EXCLUDED",
  exclusion: "EXCLUDED",
};

/**
 * Free-text NYSC status from the import file, mapped to the closed
 * `NyscStatus` enum. An unrecognised value becomes `NOT_RECORDED` (never
 * guessed as a specific status) with the original text preserved in the
 * row error report, so it's visibly flagged for a screener rather than
 * silently discarded.
 */
export function parseNyscStatus(value: string | undefined): { status: "NOT_RECORDED" | "COMPLETED" | "CURRENTLY_SERVING" | "EXEMPTED" | "EXCLUDED"; unrecognised?: string } {
  if (!value) return { status: "NOT_RECORDED" };
  const normalized = value.trim().toLowerCase();
  const mapped = NYSC_STATUS_ALIASES[normalized];
  if (mapped) return { status: mapped };
  return { status: "NOT_RECORDED", unrecognised: value };
}

const TRUE_VALUES = new Set(["yes", "true", "y", "available", "1"]);
const FALSE_VALUES = new Set(["no", "false", "n", "not available", "unavailable", "0"]);

export function parseAvailabilityDeclared(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}
