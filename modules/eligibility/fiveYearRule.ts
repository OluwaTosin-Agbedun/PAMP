import type { NyscStatus } from "@/lib/generated/prisma/client";

export type FiveYearRuleResult =
  | { outcome: "SATISFIED"; detail: string }
  | { outcome: "EXCEEDED"; detail: string }
  | { outcome: "NEEDS_SCREENER_INPUT"; detail: string };

/**
 * PAM-P 2026 Eligibility Screening Checklist §4 — "not more than five
 * years post-NYSC," using an exact date calculation (adds 5 calendar
 * years to the completion date and compares directly) rather than a
 * loose `currentYear - completionYear <= 5` check, which would wrongly
 * pass someone who completed in December five-and-a-half years ago.
 * Pure — takes `asOf` explicitly so it's deterministic in tests.
 */
export function evaluateFiveYearRule(
  nyscStatus: NyscStatus,
  nyscCompletionDate: Date | null,
  asOf: Date = new Date(),
): FiveYearRuleResult {
  if (nyscStatus === "CURRENTLY_SERVING") {
    return { outcome: "SATISFIED", detail: "Currently serving — not yet post-NYSC, so the five-year rule doesn't apply." };
  }

  if (nyscStatus === "EXEMPTED" || nyscStatus === "EXCLUDED") {
    return {
      outcome: "NEEDS_SCREENER_INPUT",
      detail: "Exemption/exclusion cases have no completion date to calculate from — the screener must confirm this item directly.",
    };
  }

  if (nyscStatus === "NOT_RECORDED") {
    return { outcome: "NEEDS_SCREENER_INPUT", detail: "No NYSC status on record." };
  }

  // COMPLETED
  if (!nyscCompletionDate) {
    return { outcome: "NEEDS_SCREENER_INPUT", detail: "NYSC marked completed, but no completion date is on record." };
  }

  const fiveYearsLater = new Date(nyscCompletionDate);
  fiveYearsLater.setFullYear(fiveYearsLater.getFullYear() + 5);

  if (asOf <= fiveYearsLater) {
    return {
      outcome: "SATISFIED",
      detail: `NYSC completed ${nyscCompletionDate.toISOString().slice(0, 10)} — within five years as of ${asOf.toISOString().slice(0, 10)}.`,
    };
  }
  return {
    outcome: "EXCEEDED",
    detail: `NYSC completed ${nyscCompletionDate.toISOString().slice(0, 10)} — more than five years before ${asOf.toISOString().slice(0, 10)}.`,
  };
}
