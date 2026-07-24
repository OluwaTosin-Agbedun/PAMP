import type { Applicant, Application, ChecklistItemStatus, NyscStatus } from "@/lib/generated/prisma/client";

import { evaluateFiveYearRule } from "./fiveYearRule";

export type PreCheckSuggestion = { status: ChecklistItemStatus; detail: string } | null;

export type PreCheckContext = {
  applicant: Pick<Applicant, "nationality" | "nyscStatus" | "nyscCompletionDate">;
  application: Pick<Application, "pathway" | "submittedAt" | "availabilityDeclared">;
  /** Document `type` strings already on file (`ApplicationDocument.type`) — free text, since import columns aren't a controlled vocabulary. */
  documentTypes: string[];
  /** Non-empty free-text `essayAnswers` keys — personal statement/motivation often arrive as an imported column, not a document. */
  essayAnswerKeys: string[];
  /** `Cohort.applicationClosesAt` — the deadline, reused rather than duplicated (§6.11). */
  applicationClosesAt: Date | null;
  hasExactDuplicate: boolean;
};

const KNOWN_PATHWAYS = ["Entrepreneurship & Enterprise", "Public & Private Sector Leadership", "Academia & Advanced Studies"];

/**
 * The real PAM-P 2026 export stores the pathway as a short form
 * ("public", "enterprise", "academia") rather than the full canonical
 * name — this recognizes a short form directly rather than treating it
 * as unmatched and asking a screener to confirm something the data
 * already unambiguously states.
 */
const PATHWAY_SHORT_FORMS: Record<string, string> = {
  public: "Public & Private Sector Leadership",
  "private sector": "Public & Private Sector Leadership",
  enterprise: "Entrepreneurship & Enterprise",
  entrepreneurship: "Entrepreneurship & Enterprise",
  academia: "Academia & Advanced Studies",
  academic: "Academia & Advanced Studies",
};

export function canonicalizePathway(pathway: string): string | null {
  const trimmed = pathway.trim();
  const exact = KNOWN_PATHWAYS.find((p) => p.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  return PATHWAY_SHORT_FORMS[trimmed.toLowerCase()] ?? null;
}

function anyMatches(haystacks: string[], keywords: string[]): boolean {
  const lower = haystacks.map((h) => h.toLowerCase());
  return keywords.some((keyword) => lower.some((h) => h.includes(keyword)));
}

/**
 * §11.1 — everything the system may pre-evaluate where reliable
 * structured data exists. Every function here returns a *suggestion*
 * (`isAutomatic: true` once persisted), never a final decision — the
 * screening service always lets a screener see and overwrite these.
 * Returns `null` for "no reliable basis to suggest anything," which is
 * the correct, honest answer for most of this cohort's existing 660
 * applicants (imported before these structured fields existed).
 */
export function evaluateDocumentItem(key: string, ctx: PreCheckContext): PreCheckSuggestion {
  const haystacks = [...ctx.documentTypes, ...ctx.essayAnswerKeys];
  const KEYWORDS: Record<string, string[]> = {
    CV: ["cv", "résumé", "resume"],
    DEGREE_CERTIFICATE: ["degree", "educational qualification", "qualification certificate"],
    NYSC_EVIDENCE: ["nysc"],
    VALID_ID_CARD: ["id card", "identification", "government id", "government-issued", "national id", "voter", "driver"],
    PASSPORT_PHOTOGRAPH: ["photo", "passport photograph"],
    PERSONAL_STATEMENT: ["personal statement"],
    MOTIVATION_FOR_APPLYING: ["motivation"],
  };

  if (key === "LEADERSHIP_PATHWAY_SELECTION") {
    const pathway = ctx.application.pathway?.trim();
    if (!pathway) return { status: "CLARIFY", detail: "No pathway recorded on the application." };
    if (pathway.includes(",") || pathway.includes("/") || pathway.toLowerCase().includes(" and ")) {
      return { status: "FAIL", detail: `More than one pathway appears to be recorded: "${pathway}".` };
    }
    const canonical = canonicalizePathway(pathway);
    if (canonical) {
      return { status: "PASS", detail: `Pathway on record: "${canonical}".` };
    }
    return { status: "CLARIFY", detail: `"${pathway}" doesn't match any of the three approved pathways — confirm before proceeding.` };
  }

  const keywords = KEYWORDS[key];
  if (!keywords) return null;
  if (anyMatches(haystacks, keywords)) {
    return { status: "PASS", detail: "A matching document or written response was found on file — confirm it's readable and complete." };
  }
  return { status: "CLARIFY", detail: "No matching document or written response was found on file." };
}

export function evaluateBaselineItem(key: string, ctx: PreCheckContext): PreCheckSuggestion {
  switch (key) {
    case "NIGERIAN_CITIZEN": {
      const nationality = ctx.applicant.nationality?.trim().toLowerCase();
      if (!nationality) return { status: "CLARIFY", detail: "No declared nationality on record." };
      if (nationality === "nigerian" || nationality === "nigeria") {
        return { status: "PASS", detail: `Declared nationality: "${ctx.applicant.nationality}".` };
      }
      // §1: "Where citizenship cannot be confirmed, mark the item as
      // Clarify rather than automatically passing it" — the same
      // caution applies to a non-Nigerian declaration, which could be a
      // data-entry error rather than a confirmed fact.
      return { status: "CLARIFY", detail: `Declared nationality "${ctx.applicant.nationality}" is not Nigerian — confirm with the applicant's ID.` };
    }
    case "NYSC_STATUS": {
      const status: NyscStatus = ctx.applicant.nyscStatus;
      if (status === "NOT_RECORDED") return { status: "CLARIFY", detail: "No NYSC status on record." };
      return { status: "PASS", detail: `NYSC status on record: ${status.replaceAll("_", " ").toLowerCase()}.` };
    }
    case "FIVE_YEAR_RULE": {
      const result = evaluateFiveYearRule(ctx.applicant.nyscStatus, ctx.applicant.nyscCompletionDate);
      if (result.outcome === "SATISFIED") return { status: "PASS", detail: result.detail };
      if (result.outcome === "EXCEEDED") return { status: "FAIL", detail: result.detail };
      return { status: "CLARIFY", detail: result.detail };
    }
    case "PROGRAMME_AVAILABILITY": {
      if (ctx.application.availabilityDeclared === null || ctx.application.availabilityDeclared === undefined) {
        return { status: "CLARIFY", detail: "No participation declaration on record." };
      }
      return ctx.application.availabilityDeclared
        ? { status: "PASS", detail: "Applicant declared availability for all programme requirements." }
        : { status: "FAIL", detail: "Applicant declared they cannot meet the programme's participation requirements." };
    }
    case "SUBMITTED_WITHIN_DEADLINE": {
      if (!ctx.application.submittedAt) return { status: "CLARIFY", detail: "No portal submission timestamp on record." };
      if (!ctx.applicationClosesAt) return { status: "CLARIFY", detail: "No programme deadline configured for this cohort yet." };
      if (ctx.application.submittedAt <= ctx.applicationClosesAt) {
        return { status: "PASS", detail: `Submitted ${ctx.application.submittedAt.toISOString()}, before the ${ctx.applicationClosesAt.toISOString()} deadline.` };
      }
      return { status: "FAIL", detail: `Submitted ${ctx.application.submittedAt.toISOString()}, after the ${ctx.applicationClosesAt.toISOString()} deadline.` };
    }
    // MIN_QUALIFICATION, LEADERSHIP_POTENTIAL, ETHICAL_ORIENTATION are
    // explicitly human-judgement items (§11.2) — no automatic suggestion.
    default:
      return null;
  }
}

export function evaluateIntegrityItem(key: string, ctx: PreCheckContext): PreCheckSuggestion {
  if (key === "DUPLICATE_APPLICATION") {
    return ctx.hasExactDuplicate
      ? { status: "FLAG", detail: "An exact match on email, phone, or government ID was found on another application in this cohort." }
      : { status: "CLEAR", detail: "No exact email, phone, or government ID match found in this cohort." };
  }
  // Name/date consistency, readability, alteration, and written-response
  // authenticity are all explicitly human-judgement items (§11.2).
  return null;
}
