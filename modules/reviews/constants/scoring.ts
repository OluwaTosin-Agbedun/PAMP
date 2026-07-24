import { Prisma } from "@/lib/generated/prisma/client";

/**
 * The scoring engine's decimal strategy (Phase 3A §10). Every calculation
 * uses `Prisma.Decimal` (decimal.js under the hood) instead of native
 * `number` arithmetic — binary floating point cannot represent values
 * like 0.1 exactly, and summing many criterion scores/weights with it
 * would accumulate silent rounding error in an authoritative total.
 *
 * Rounding only ever happens once, at the very end of
 * `calculateReviewTotal` (see modules/reviews/domain/scoring.ts) — every
 * intermediate value (a criterion's weighted contribution, the running
 * sum across criteria) is kept at full decimal.js precision. Rounding
 * per-criterion first and then summing would compound error across
 * criteria; rounding once at the end does not. The displayed total and
 * the stored total (`Review.totalScore`, `Decimal(6,2)`) are therefore
 * always the same number — there is no separate "display rounding."
 */
export const SCORE_DECIMAL_PLACES = 2;

export const SCORE_ROUNDING_MODE = Prisma.Decimal.ROUND_HALF_UP;
