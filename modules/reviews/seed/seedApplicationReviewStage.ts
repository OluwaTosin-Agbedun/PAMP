import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const APPLICATION_REVIEW_STAGE_CODE = "APPLICATION_REVIEW";

/** The one fact stated directly, and only, in the Phase 3A brief (§4): the Application Review stage's declared maximum. */
export const APPLICATION_REVIEW_MAX_SCORE = "60";

export type SeedApplicationReviewStageResult = {
  stageId: string;
  created: boolean;
  frameworkSeeded: false;
  missingInformation: string[];
};

/**
 * Idempotently seeds the "Application Review" ReviewStage — and *only*
 * the stage. Per §20, this deliberately does NOT create a
 * ReviewFramework or any ReviewCriterion rows: no "PAM-P Selection
 * Metrics Framework" or "Application Review Guidelines" document exists
 * anywhere in this repository (confirmed by search — see
 * docs/PHASE_3A_IMPLEMENTATION_REPORT.md §14), so the individual
 * criterion names, per-criterion maximums/weights, descriptions,
 * reviewer guidance, and rating scales the brief requires the seed to
 * derive from those documents are simply not available. Inventing
 * plausible-looking criteria that sum to 60 would satisfy the *number*
 * but violate the explicit instruction not to invent scoring criteria —
 * so this stops here, at the one fact the brief states directly (§4:
 * "Application Review: maximum score of 60"), and reports exactly what's
 * missing rather than guessing it.
 *
 * Safe to run repeatedly: looks up the stage by its unique
 * (programmeId, cohortId, code) before creating it. Takes a
 * `PrismaClient` parameter rather than importing the shared
 * `lib/db/prisma` singleton, deliberately — this needs to run from
 * `prisma/seed.ts`, a plain Node script (`tsx`), not just from inside
 * the Next.js server bundle, so it can't carry a `"server-only"` guard
 * or assume the singleton's module graph is available.
 */
export async function seedApplicationReviewStage(
  db: Pick<PrismaClient, "reviewStage">,
  programmeId: string,
): Promise<SeedApplicationReviewStageResult> {
  const existing = await db.reviewStage.findFirst({
    where: { programmeId, cohortId: null, code: APPLICATION_REVIEW_STAGE_CODE },
  });

  const missingInformation = [
    "The approved list of Application Review criteria (names/codes).",
    "Each criterion's maximum score and/or weight within the 60-point total.",
    "Each criterion's approved description and reviewer guidance.",
    "Whether any criterion uses a rating scale, and if so its bands/labels/anchors.",
    "The criteria's approved display order.",
  ];

  if (existing) {
    return { stageId: existing.id, created: false, frameworkSeeded: false, missingInformation };
  }

  const stage = await db.reviewStage.create({
    data: {
      programmeId,
      cohortId: null,
      name: "Application Review",
      code: APPLICATION_REVIEW_STAGE_CODE,
      description: "First-stage review of a submitted application against the approved scoring rubric.",
      maxTotalScore: new Prisma.Decimal(APPLICATION_REVIEW_MAX_SCORE),
      status: "DRAFT",
      sequenceOrder: 0,
      commentsRequired: false,
      allCriteriaMandatory: true,
      allowPartialDraft: true,
    },
  });

  return { stageId: stage.id, created: true, frameworkSeeded: false, missingInformation };
}
