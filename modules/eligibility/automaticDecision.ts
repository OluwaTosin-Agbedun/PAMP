import type { ChecklistItemStatus, ChecklistSection } from "@/lib/generated/prisma/client";

/**
 * PAM-P Application Eligibility Criteria — the checklist items that have
 * a real automatic evaluator (`automaticPreChecks.ts`), and only those,
 * are what this engine's automatic ELIGIBLE/INELIGIBLE decision is based
 * on. `MIN_QUALIFICATION`, `LEADERSHIP_POTENTIAL`, `ETHICAL_ORIENTATION`,
 * `NAME_CONSISTENCY`, `DATE_CONSISTENCY`, `DOCUMENT_READABILITY`,
 * `POSSIBLE_ALTERATION`, and `WRITTEN_RESPONSE_AUTHENTICITY` are
 * genuinely unverifiable without human judgement (`automaticPreChecks
 * .ts`'s own §11.2 doc comment already says so) — they are deliberately
 * excluded from this automatic gate rather than given a fabricated
 * verdict. An admin can still review and override any application's
 * status by hand regardless of what this engine decides.
 */
export const AUTOMATIC_GATE_ITEMS: { section: ChecklistSection; itemKey: string }[] = [
  { section: "BASELINE", itemKey: "NIGERIAN_CITIZEN" },
  { section: "BASELINE", itemKey: "NYSC_STATUS" },
  { section: "BASELINE", itemKey: "FIVE_YEAR_RULE" },
  { section: "BASELINE", itemKey: "PROGRAMME_AVAILABILITY" },
  { section: "BASELINE", itemKey: "SUBMITTED_WITHIN_DEADLINE" },
  { section: "DOCUMENT", itemKey: "CV" },
  { section: "DOCUMENT", itemKey: "DEGREE_CERTIFICATE" },
  { section: "DOCUMENT", itemKey: "NYSC_EVIDENCE" },
  { section: "DOCUMENT", itemKey: "VALID_ID_CARD" },
  { section: "DOCUMENT", itemKey: "PASSPORT_PHOTOGRAPH" },
  { section: "DOCUMENT", itemKey: "PERSONAL_STATEMENT" },
  { section: "DOCUMENT", itemKey: "MOTIVATION_FOR_APPLYING" },
  { section: "DOCUMENT", itemKey: "LEADERSHIP_PATHWAY_SELECTION" },
];

/** The one integrity signal with a real automatic evaluator — kept separate from `AUTOMATIC_GATE_ITEMS` since a duplicate flag maps to the stricter `DISQUALIFIED` outcome, not `INELIGIBLE`. */
const DUPLICATE_GATE_ITEM = { section: "INTEGRITY" as ChecklistSection, itemKey: "DUPLICATE_APPLICATION" };

export type AutomaticGateOutcome = "ELIGIBLE" | "INELIGIBLE" | "DISQUALIFIED" | "CLARIFICATION_REQUIRED";

export type GateItemRecord = { section: ChecklistSection; itemKey: string; status: ChecklistItemStatus | null };

export type AutomaticDecision = {
  outcome: AutomaticGateOutcome;
  reason: string;
  failedItems: string[];
  clarifyItems: string[];
};

/**
 * Pure aggregation, no I/O. `FAIL` on any gate item → `INELIGIBLE`.
 * `FLAG` on the duplicate check → `DISQUALIFIED` (an integrity concern,
 * not just an incomplete file — same escalation `markDisqualified`
 * already uses). Missing or `CLARIFY` data → `CLARIFICATION_REQUIRED`,
 * never an automatic `INELIGIBLE` on incomplete information. Only once
 * every gate item is `PASS`/`CLEAR` does this return `ELIGIBLE`.
 */
export function decideAutomaticEligibility(items: GateItemRecord[]): AutomaticDecision {
  const byKey = new Map(items.map((i) => [`${i.section}:${i.itemKey}`, i.status]));

  const duplicateStatus = byKey.get(`${DUPLICATE_GATE_ITEM.section}:${DUPLICATE_GATE_ITEM.itemKey}`);
  if (duplicateStatus === "FLAG") {
    return {
      outcome: "DISQUALIFIED",
      reason: "A duplicate application was detected against another record in this cohort.",
      failedItems: [],
      clarifyItems: [],
    };
  }

  const failedItems: string[] = [];
  const clarifyItems: string[] = [];
  for (const gate of AUTOMATIC_GATE_ITEMS) {
    const status = byKey.get(`${gate.section}:${gate.itemKey}`);
    if (status === "FAIL") failedItems.push(gate.itemKey);
    else if (status !== "PASS") clarifyItems.push(gate.itemKey); // covers CLARIFY, null, and undefined (never evaluated)
  }

  if (failedItems.length > 0) {
    return { outcome: "INELIGIBLE", reason: `Did not meet: ${failedItems.join(", ")}.`, failedItems, clarifyItems };
  }
  if (clarifyItems.length > 0) {
    return { outcome: "CLARIFICATION_REQUIRED", reason: `Needs clarification: ${clarifyItems.join(", ")}.`, failedItems, clarifyItems };
  }
  return { outcome: "ELIGIBLE", reason: "All automatically verifiable criteria passed.", failedItems: [], clarifyItems: [] };
}
