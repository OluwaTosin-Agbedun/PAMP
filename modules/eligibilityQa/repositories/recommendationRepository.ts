import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * The current decision source of truth is `EligibilityScreening`
 * (written by the automatic engine and, on execution below, by this
 * module) — not the retired `EligibilityDecision` model, which nothing
 * has written to since `modules/eligibility/engine.ts` was deleted.
 */
export function getCurrentScreening(applicationId: string) {
  return prisma.eligibilityScreening.findUnique({ where: { applicationId } });
}

export function createRecommendation(data: {
  applicationId: string;
  raisedById: string;
  currentIsEligible: boolean;
  recommendedIsEligible: boolean;
  reason: string;
}) {
  return prisma.eligibilityRecommendation.create({ data });
}

export function getRecommendation(id: string) {
  return prisma.eligibilityRecommendation.findUnique({
    where: { id },
    include: { application: { include: { applicant: true } }, raisedBy: { select: { id: true, name: true } } },
  });
}

export function listPendingRecommendations() {
  return prisma.eligibilityRecommendation.findMany({
    where: { status: "PENDING" },
    include: { application: { include: { applicant: true } }, raisedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export function listRecommendationsForApplication(applicationId: string) {
  return prisma.eligibilityRecommendation.findMany({
    where: { applicationId },
    include: { raisedBy: { select: { id: true, name: true } }, executedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export function resolveRecommendation(
  id: string,
  data: { status: "EXECUTED" | "DISMISSED"; executedById: string; executionNote?: string },
) {
  return prisma.eligibilityRecommendation.update({
    where: { id },
    data: { status: data.status, executedById: data.executedById, executedAt: new Date(), executionNote: data.executionNote },
  });
}

/**
 * Deliberately touches only `Application.eligibilityStatus`, not
 * `stage` — an override can be executed at any later point (e.g. after
 * reviewers are already assigned), so cascading into a pipeline-stage
 * reset here could silently undo unrelated progress. Also records the
 * decision on `EligibilityScreening` itself (`decidedById: actor.id`,
 * same shape `recordDecision` in `screeningRepository.ts` writes) so
 * the screening workspace and `Application.eligibilityStatus` never
 * disagree about the current outcome.
 */
export async function executeOverrideDecision(
  applicationId: string,
  data: { isEligible: boolean; decidedById: string; reasonForDecision: string },
) {
  const status = data.isEligible ? "ELIGIBLE" : "INELIGIBLE";
  const screening = await prisma.eligibilityScreening.upsert({
    where: { applicationId },
    update: {},
    create: { applicationId },
  });

  await prisma.eligibilityScreening.update({
    where: { id: screening.id },
    data: {
      status,
      nextAction: data.isEligible ? "PROCEED" : "REJECT",
      reasonForDecision: data.reasonForDecision,
      decidedById: data.decidedById,
      decidedAt: new Date(),
      dateReviewed: new Date(),
    },
  });

  return prisma.application.update({
    where: { id: applicationId },
    data: { eligibilityStatus: status },
  });
}
