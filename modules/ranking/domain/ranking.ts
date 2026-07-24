import { Prisma } from "@/lib/generated/prisma/client";
import type { EligibilityStatus } from "@/lib/generated/prisma/client";

import { SCORE_DECIMAL_PLACES, SCORE_ROUNDING_MODE } from "@/modules/reviews/constants/scoring";
import { toDecimal } from "@/modules/reviews/domain/scoring";

/**
 * The Final Ranking Engine's pure calculation core (Addendum Modules
 * 4-5). No I/O, no Prisma queries — every function here takes plain
 * already-loaded values and returns a value, so the exact ranking rules
 * (the addendum's own words, not an invented interpretation) are
 * unit-testable in isolation. `modules/ranking/services/rankingService.ts`
 * is the only caller that touches a database.
 */

export { toDecimal };

/**
 * Addendum Module 4: "Application Review (/60) + Interview (/40) = Final
 * Score (/100)." A straight sum — no additional weighting multiplier —
 * confirmed against the PAM-P 2026 Metrics Framework document's own §9
 * worked total (60 + 40 = 100), which resolves the "should review or
 * interview count for more" question ADR-0015 explicitly left open.
 * Rounds once, the same single-rounding-step discipline
 * docs/SCORE_CALCULATION_RULES.md establishes everywhere else — both
 * inputs are already individually rounded to 2dp, so this is a trivial,
 * lossless final step, not a second meaningful rounding pass.
 */
export function calculateCompositeScore(
  reviewAverage: Prisma.Decimal | number | string,
  interviewAverage: Prisma.Decimal | number | string,
): Prisma.Decimal {
  return toDecimal(reviewAverage).plus(toDecimal(interviewAverage)).toDecimalPlaces(SCORE_DECIMAL_PLACES, SCORE_ROUNDING_MODE);
}

export type FinalScoreDecisionBand = "STRONGLY_RECOMMENDED" | "RECOMMENDED" | "RESERVE_BORDERLINE" | "NOT_RECOMMENDED";

/**
 * PAM-P 2026 Application Review and Selection Metrics Framework, §9 —
 * fixed grading bands stated directly in the approved document (85-100 /
 * 75-84 / 65-74 / below 65), not a Configuration Centre setting. Unlike
 * the final cohort size or reserve-list size (genuine programme policy,
 * meant to be tuned), these boundaries are the document's own grading
 * scale, the same way Application Review's max-60/Interview's max-40 are
 * treated as literal constants rather than settings. Purely informational
 * — never a workflow gate (§9 of the current instruction: decision bands
 * inform, they don't replace the ranking-and-approval workflow).
 */
export function decisionBandFor(compositeScore: Prisma.Decimal | number | string): FinalScoreDecisionBand {
  const score = toDecimal(compositeScore);
  if (score.greaterThanOrEqualTo(85)) return "STRONGLY_RECOMMENDED";
  if (score.greaterThanOrEqualTo(75)) return "RECOMMENDED";
  if (score.greaterThanOrEqualTo(65)) return "RESERVE_BORDERLINE";
  return "NOT_RECOMMENDED";
}

export type RankingIneligibilityReason =
  | "APPLICATION_NOT_ELIGIBLE"
  | "APPLICATION_WITHDRAWN"
  | "MISSING_REVIEW_SCORE"
  | "MISSING_INTERVIEW_SCORE"
  | "INTEGRITY_HOLD";

export type RankingEligibilityInput = {
  eligibilityStatus: EligibilityStatus;
  deletedAt: Date | null;
  /** Eligibility Screening's own staff-recorded withdrawal — distinct from `deletedAt` (a system-level soft delete). */
  isWithdrawn: boolean;
  reviewAverage: Prisma.Decimal | null;
  interviewAverage: Prisma.Decimal | null;
  hasIntegrityHold: boolean;
};

export type RankingEligibilityResult = { eligible: true } | { eligible: false; reason: RankingIneligibilityReason };

/**
 * §5.1 — every exclusion rule this repository's schema can actually
 * express today: application eligibility (`eligibilityStatus` — now the
 * full Eligibility Screening Checklist's decision, not the old vacuous
 * automatic engine's), withdrawal (`isWithdrawn`, the Eligibility
 * Screening module's own field, or the system-level `deletedAt` soft
 * delete — either means "no longer active"), completion of both scoring
 * stages (`reviewAverage`/`interviewAverage` non-null — which already,
 * transitively, requires a resolved third-review escalation and a valid
 * 3-or-4-panelist interview submission, since
 * `scoreAggregationService.ts` only ever writes a non-null average once
 * those are satisfied), and an integrity hold (metrics-framework.md
 * §9/§12: "Integrity Concern → Hold/Disqualify... overrides score").
 * Checked in a fixed order so the *first* applicable reason is always
 * the one reported, not an arbitrary one.
 */
export function determineRankingEligibility(input: RankingEligibilityInput): RankingEligibilityResult {
  if (input.deletedAt || input.isWithdrawn) return { eligible: false, reason: "APPLICATION_WITHDRAWN" };
  if (input.eligibilityStatus !== "ELIGIBLE") return { eligible: false, reason: "APPLICATION_NOT_ELIGIBLE" };
  if (input.hasIntegrityHold) return { eligible: false, reason: "INTEGRITY_HOLD" };
  if (input.reviewAverage === null) return { eligible: false, reason: "MISSING_REVIEW_SCORE" };
  if (input.interviewAverage === null) return { eligible: false, reason: "MISSING_INTERVIEW_SCORE" };
  return { eligible: true };
}

export type RankableApplication = {
  applicationId: string;
  compositeScore: Prisma.Decimal;
  interviewAverage: Prisma.Decimal;
  reviewAverage: Prisma.Decimal;
};

export type RankedEntry = {
  applicationId: string;
  rank: number;
  compositeScore: Prisma.Decimal;
  /** True once every one of Level 1 (interview score) / Level 2 (review score) / composite still matches at least one neighbor — a genuine Level 3 tie, per Addendum Module 5. */
  tieLevel3: boolean;
};

export type TieGroup = {
  compositeScore: Prisma.Decimal;
  /** Deterministic (applicationId ascending) — the storage order only, never presented as an approved tie-break result. */
  applicationIds: string[];
};

export type RankResult = {
  entries: RankedEntry[];
  tieGroups: TieGroup[];
};

function isFullTie(a: RankableApplication, b: RankableApplication): boolean {
  return a.compositeScore.equals(b.compositeScore) && a.interviewAverage.equals(b.interviewAverage) && a.reviewAverage.equals(b.reviewAverage);
}

/**
 * Addendum Module 5's exact tie-break rule, applied as the sort itself
 * rather than a separate pass: Level 1 (interview score, higher wins),
 * then Level 2 (application review score, higher wins) automatically
 * separate every tie that has *any* difference in either component —
 * only applications identical on both, and therefore on the composite
 * too, ever reach Level 3. Level 3 pairs still receive distinct,
 * deterministic ranks (applicationId ascending — a storage necessity,
 * not the approved resolution) so the snapshot always has a total order
 * with no duplicate rank numbers; `tieGroups` is the actual Level 3
 * record the Committee acts on.
 */
export function rankApplications(applications: RankableApplication[]): RankResult {
  const sorted = [...applications].sort((a, b) => {
    const byComposite = b.compositeScore.comparedTo(a.compositeScore);
    if (byComposite !== 0) return byComposite;
    const byInterview = b.interviewAverage.comparedTo(a.interviewAverage);
    if (byInterview !== 0) return byInterview;
    const byReview = b.reviewAverage.comparedTo(a.reviewAverage);
    if (byReview !== 0) return byReview;
    return a.applicationId.localeCompare(b.applicationId);
  });

  const tieGroupsByScore = new Map<string, string[]>();
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const tiedWithPrev = i > 0 && isFullTie(sorted[i - 1], current);
    const tiedWithNext = i < sorted.length - 1 && isFullTie(current, sorted[i + 1]);
    if (tiedWithPrev || tiedWithNext) {
      const key = current.compositeScore.toString();
      const group = tieGroupsByScore.get(key) ?? [];
      group.push(current.applicationId);
      tieGroupsByScore.set(key, group);
    }
  }

  const tiedApplicationIds = new Set([...tieGroupsByScore.values()].flat());

  const entries: RankedEntry[] = sorted.map((application, index) => ({
    applicationId: application.applicationId,
    rank: index + 1,
    compositeScore: application.compositeScore,
    tieLevel3: tiedApplicationIds.has(application.applicationId),
  }));

  const tieGroups: TieGroup[] = [...tieGroupsByScore.entries()].map(([scoreKey, applicationIds]) => ({
    compositeScore: toDecimal(scoreKey),
    applicationIds,
  }));

  return { entries, tieGroups };
}
