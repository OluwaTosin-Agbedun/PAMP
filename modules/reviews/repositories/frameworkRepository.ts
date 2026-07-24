import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Pure data access for review stages, frameworks, criteria, and rating
 * scales — no permission checks, no audit writes, no business
 * validation. Those live in modules/reviews/services/frameworkService.ts
 * and modules/reviews/domain/. Keeping this layer dumb is what makes the
 * service layer's rules ("a DRAFT framework only," "publish must
 * validate first") testable without a database, and this layer's
 * queries testable without re-deriving permission logic.
 */

export function getReviewStage(id: string) {
  return prisma.reviewStage.findUnique({ where: { id } });
}

export function listReviewStages(programmeId: string, cohortId?: string | null) {
  return prisma.reviewStage.findMany({
    where: { programmeId, OR: [{ cohortId: null }, { cohortId: cohortId ?? undefined }] },
    orderBy: { sequenceOrder: "asc" },
  });
}

export function createReviewStage(data: Prisma.ReviewStageUncheckedCreateInput) {
  return prisma.reviewStage.create({ data });
}

export function updateReviewStage(id: string, data: Prisma.ReviewStageUncheckedUpdateInput) {
  return prisma.reviewStage.update({ where: { id }, data });
}

const FRAMEWORK_WITH_CRITERIA = {
  criteria: { include: { ratingScale: { include: { bands: true } } } },
  ratingScales: { include: { bands: true } },
  reviewStage: true,
} satisfies Prisma.ReviewFrameworkInclude;

export function getFramework(id: string) {
  return prisma.reviewFramework.findUnique({
    where: { id },
    include: FRAMEWORK_WITH_CRITERIA,
  });
}

export function getPublishedFrameworkForStage(reviewStageId: string) {
  return prisma.reviewFramework.findFirst({
    where: { reviewStageId, status: "PUBLISHED" },
    include: FRAMEWORK_WITH_CRITERIA,
  });
}

export function listFrameworksForStage(reviewStageId: string) {
  return prisma.reviewFramework.findMany({
    where: { reviewStageId },
    orderBy: { version: "desc" },
  });
}

export async function getNextFrameworkVersion(reviewStageId: string): Promise<number> {
  const latest = await prisma.reviewFramework.findFirst({
    where: { reviewStageId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export function createFrameworkDraft(data: Prisma.ReviewFrameworkUncheckedCreateInput) {
  return prisma.reviewFramework.create({ data, include: FRAMEWORK_WITH_CRITERIA });
}

export function updateFrameworkDraft(id: string, data: Prisma.ReviewFrameworkUncheckedUpdateInput) {
  return prisma.reviewFramework.update({ where: { id }, data, include: FRAMEWORK_WITH_CRITERIA });
}

export function publishFrameworkRow(
  id: string,
  data: { totalConfiguredScore: Prisma.Decimal; publishedById: string; publishedAt: Date },
) {
  return prisma.reviewFramework.update({
    where: { id },
    data: { status: "PUBLISHED", ...data },
  });
}

export function retireFrameworkRow(id: string, data: { retiredById: string; retiredAt: Date }) {
  return prisma.reviewFramework.update({
    where: { id },
    data: { status: "RETIRED", ...data },
  });
}

export function findOtherPublishedFrameworksForStage(reviewStageId: string, excludeId: string) {
  return prisma.reviewFramework.findMany({
    where: { reviewStageId, status: "PUBLISHED", id: { not: excludeId } },
  });
}

export function createCriterion(data: Prisma.ReviewCriterionUncheckedCreateInput) {
  return prisma.reviewCriterion.create({ data });
}

export function updateCriterion(id: string, data: Prisma.ReviewCriterionUncheckedUpdateInput) {
  return prisma.reviewCriterion.update({ where: { id }, data });
}

export function getCriterion(id: string) {
  return prisma.reviewCriterion.findUnique({ where: { id }, include: { reviewFramework: true } });
}

export function createRatingScaleWithBands(data: {
  reviewFrameworkId: string;
  name: string;
  description?: string | null;
  bands: Prisma.RatingScaleBandUncheckedCreateWithoutRatingScaleInput[];
}) {
  return prisma.ratingScale.create({
    data: {
      reviewFrameworkId: data.reviewFrameworkId,
      name: data.name,
      description: data.description,
      bands: { create: data.bands },
    },
    include: { bands: true },
  });
}
