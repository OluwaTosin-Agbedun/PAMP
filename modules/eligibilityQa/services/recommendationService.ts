import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as repo from "../repositories/recommendationRepository";
import type { CreateRecommendationInput } from "../validation/schemas";

/**
 * The Eligibility Reviewer QA role (Release 1.5 §"Governance
 * Resolution") — resolves the open question Phase 3B.1 flagged (ADR-0009):
 * eligibility screening stays fully automatic; `ELIGIBILITY_REVIEWER`
 * gains exactly one write action — flag a questionable automated outcome
 * and recommend a different one. It never calls
 * `updateApplicationEligibility` itself; only `executeOverride` (below,
 * `eligibility_override.execute`, Programme Secretariat only) does.
 */
export async function createRecommendation(actorId: string, input: CreateRecommendationInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_RECOMMENDATIONS_CREATE);

  const screening = await repo.getCurrentScreening(input.applicationId);
  if (!screening || screening.status === "PENDING_SCREENING") {
    throw new NotFoundError("No eligibility outcome exists for that application yet.");
  }
  const currentIsEligible = screening.status === "ELIGIBLE";

  const recommendation = await repo.createRecommendation({
    applicationId: input.applicationId,
    raisedById: actor.id,
    currentIsEligible,
    recommendedIsEligible: input.recommendedIsEligible,
    reason: input.reason,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_RECOMMENDATION_CREATED,
    entityType: "EligibilityRecommendation",
    entityId: recommendation.id,
    metadata: {
      applicationId: input.applicationId,
      currentIsEligible,
      recommendedIsEligible: input.recommendedIsEligible,
    },
  });

  return recommendation;
}

export async function listPendingRecommendations(actorId: string) {
  await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_OVERRIDE_EXECUTE);
  return repo.listPendingRecommendations();
}

export async function listRecommendationsForApplication(actorId: string, applicationId: string) {
  await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_REVIEW);
  return repo.listRecommendationsForApplication(applicationId);
}

async function loadPendingOrThrow(recommendationId: string) {
  const recommendation = await repo.getRecommendation(recommendationId);
  if (!recommendation) throw new NotFoundError("That recommendation doesn't exist.");
  if (recommendation.status !== "PENDING") {
    throw new ConflictError("This recommendation has already been resolved.");
  }
  return recommendation;
}

/**
 * "Only Programme Secretariat may execute an approved override" —
 * enforced by `eligibility_override.execute`, granted to
 * PROGRAMME_SECRETARY (and PROGRAMME_DIRECTOR/SYSTEM_ADMIN via
 * PROGRAMME_OVERSIGHT), never to ELIGIBILITY_REVIEWER — the reviewer
 * who raised the recommendation cannot execute their own. This is now
 * the sole path an Eligibility Reviewer's flagged case can actually be
 * resolved through: that role holds `ELIGIBILITY_RECOMMENDATIONS_CREATE`
 * but not `ELIGIBILITY_SCREENING_PERFORM`, so it can recommend but never
 * decide directly (`lib/permissions/rolePermissions.ts`).
 *
 * Refuses once a *different*, more recent human decision already exists
 * on the screening (`EligibilityScreening.decidedById` set by someone
 * other than this execution) — e.g. a Secretariat account acting
 * directly through the full screening workspace. Executing would
 * silently overwrite a decision this recommendation was never raised
 * against. Reopen the screening instead
 * (`modules/eligibility/screeningService.ts`'s `reopenScreening`).
 */
export async function executeOverride(actorId: string, recommendationId: string, executionNote?: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_OVERRIDE_EXECUTE);
  const recommendation = await loadPendingOrThrow(recommendationId);

  const screening = await prisma.eligibilityScreening.findUnique({
    where: { applicationId: recommendation.applicationId },
    select: { decidedById: true },
  });
  if (screening?.decidedById) {
    throw new ConflictError(
      "This application already has a confirmed Eligibility Screening Checklist decision. Reopen the screening instead of executing this override.",
    );
  }

  await repo.executeOverrideDecision(recommendation.applicationId, {
    isEligible: recommendation.recommendedIsEligible,
    decidedById: actor.id,
    reasonForDecision: executionNote ?? recommendation.reason,
  });
  await repo.resolveRecommendation(recommendationId, { status: "EXECUTED", executedById: actor.id, executionNote });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_OVERRIDE_EXECUTED,
    entityType: "EligibilityRecommendation",
    entityId: recommendationId,
    metadata: {
      applicationId: recommendation.applicationId,
      newIsEligible: recommendation.recommendedIsEligible,
      raisedById: recommendation.raisedById,
      executionNote: executionNote ?? null,
    },
  });
}

export async function dismissRecommendation(actorId: string, recommendationId: string, executionNote?: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_OVERRIDE_EXECUTE);
  const recommendation = await loadPendingOrThrow(recommendationId);

  await repo.resolveRecommendation(recommendationId, { status: "DISMISSED", executedById: actor.id, executionNote });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_RECOMMENDATION_DISMISSED,
    entityType: "EligibilityRecommendation",
    entityId: recommendationId,
    metadata: { applicationId: recommendation.applicationId, executionNote: executionNote ?? null },
  });
}
