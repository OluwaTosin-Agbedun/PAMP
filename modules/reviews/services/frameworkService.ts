import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { FrameworkLockedError, InvalidReviewFrameworkError, NotFoundError } from "@/lib/errors";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ReviewFramework } from "@/lib/generated/prisma/client";
import { requirePermission } from "@/lib/permissions/service";
import { PERMISSIONS } from "@/lib/permissions/catalog";

import { validateFrameworkForPublish } from "../domain/frameworkValidation";
import * as repo from "../repositories/frameworkRepository";
import type {
  CreateCriterionInput,
  CreateRatingScaleInput,
  CreateReviewFrameworkInput,
  CreateReviewStageInput,
  PublishReviewFrameworkInput,
  RetireReviewFrameworkInput,
  UpdateCriterionInput,
} from "../validation/schemas";

/**
 * Orchestration for review stages, frameworks, criteria, and rating
 * scales: permission checks, business rules (a framework is only
 * editable while DRAFT), transactions, and audit logging. Every
 * function here is what a future admin UI's Server Actions would call —
 * none of this is wired to a route in Phase 3A (§24: no framework admin
 * UI this phase), but the service boundary is where that UI's Server
 * Actions would sit, so nothing about adding it later touches this file.
 */

function assertFrameworkEditable(framework: Pick<ReviewFramework, "status">) {
  if (framework.status !== "DRAFT") {
    throw new FrameworkLockedError();
  }
}

export async function createReviewStage(actorId: string, input: CreateReviewStageInput) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_FRAMEWORKS_CREATE);

  const stage = await repo.createReviewStage({
    programmeId: input.programmeId,
    cohortId: input.cohortId ?? null,
    name: input.name,
    code: input.code,
    description: input.description,
    maxTotalScore: new Prisma.Decimal(input.maxTotalScore),
    sequenceOrder: input.sequenceOrder,
    opensAt: input.opensAt ?? null,
    closesAt: input.closesAt ?? null,
    commentsRequired: input.commentsRequired,
    allCriteriaMandatory: input.allCriteriaMandatory,
    allowPartialDraft: input.allowPartialDraft,
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.REVIEW_STAGE_CREATED,
    entityType: "ReviewStage",
    entityId: stage.id,
    programmeId: stage.programmeId,
    cohortId: stage.cohortId ?? undefined,
    metadata: { name: stage.name, code: stage.code, maxTotalScore: stage.maxTotalScore.toString() },
  });

  return stage;
}

export async function createReviewFrameworkDraft(actorId: string, input: CreateReviewFrameworkInput) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_FRAMEWORKS_CREATE);

  const stage = await repo.getReviewStage(input.reviewStageId);
  if (!stage) throw new NotFoundError("That review stage doesn't exist.");

  const version = await repo.getNextFrameworkVersion(stage.id);

  const framework = await repo.createFrameworkDraft({
    reviewStageId: stage.id,
    programmeId: stage.programmeId,
    cohortId: stage.cohortId,
    version,
    effectiveAt: input.effectiveAt ?? null,
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.REVIEW_FRAMEWORK_CREATED,
    entityType: "ReviewFramework",
    entityId: framework.id,
    programmeId: stage.programmeId,
    cohortId: stage.cohortId ?? undefined,
    metadata: { reviewStageId: stage.id, version },
  });

  return framework;
}

export async function createCriterion(actorId: string, input: CreateCriterionInput) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_FRAMEWORKS_UPDATE);

  const framework = await repo.getFramework(input.reviewFrameworkId);
  if (!framework) throw new NotFoundError("That review framework doesn't exist.");
  assertFrameworkEditable(framework);

  const criterion = await repo.createCriterion({
    reviewFrameworkId: framework.id,
    code: input.code,
    label: input.label,
    description: input.description,
    reviewerGuidance: input.reviewerGuidance,
    evidenceGuidance: input.evidenceGuidance,
    displayOrder: input.displayOrder,
    minScore: new Prisma.Decimal(input.minScore),
    maxScore: new Prisma.Decimal(input.maxScore),
    weight: new Prisma.Decimal(input.weight),
    isMandatory: input.isMandatory,
    isCommentMandatory: input.isCommentMandatory,
    allowDecimalScores: input.allowDecimalScores,
    ratingScaleId: input.ratingScaleId ?? null,
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.REVIEW_CRITERION_CREATED,
    entityType: "ReviewCriterion",
    entityId: criterion.id,
    programmeId: framework.programmeId,
    cohortId: framework.cohortId ?? undefined,
    metadata: { reviewFrameworkId: framework.id, code: criterion.code, label: criterion.label },
  });

  return criterion;
}

export async function updateCriterion(actorId: string, input: UpdateCriterionInput) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_FRAMEWORKS_UPDATE);

  const criterion = await repo.getCriterion(input.criterionId);
  if (!criterion) throw new NotFoundError("That criterion doesn't exist.");
  assertFrameworkEditable(criterion.reviewFramework);

  const wasActive = criterion.isActive;

  const updated = await repo.updateCriterion(criterion.id, {
    ...(input.code !== undefined && { code: input.code }),
    ...(input.label !== undefined && { label: input.label }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.reviewerGuidance !== undefined && { reviewerGuidance: input.reviewerGuidance }),
    ...(input.evidenceGuidance !== undefined && { evidenceGuidance: input.evidenceGuidance }),
    ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
    ...(input.minScore !== undefined && { minScore: new Prisma.Decimal(input.minScore) }),
    ...(input.maxScore !== undefined && { maxScore: new Prisma.Decimal(input.maxScore) }),
    ...(input.weight !== undefined && { weight: new Prisma.Decimal(input.weight) }),
    ...(input.isMandatory !== undefined && { isMandatory: input.isMandatory }),
    ...(input.isCommentMandatory !== undefined && { isCommentMandatory: input.isCommentMandatory }),
    ...(input.allowDecimalScores !== undefined && { allowDecimalScores: input.allowDecimalScores }),
    ...(input.ratingScaleId !== undefined && { ratingScaleId: input.ratingScaleId }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  });

  await writeAuditLog({
    actorId,
    action:
      wasActive && input.isActive === false
        ? AUDIT_ACTIONS.REVIEW_CRITERION_RETIRED
        : AUDIT_ACTIONS.REVIEW_CRITERION_UPDATED,
    entityType: "ReviewCriterion",
    entityId: criterion.id,
    programmeId: criterion.reviewFramework.programmeId,
    cohortId: criterion.reviewFramework.cohortId ?? undefined,
    metadata: { reviewFrameworkId: criterion.reviewFrameworkId },
  });

  return updated;
}

export async function createRatingScale(actorId: string, input: CreateRatingScaleInput) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_FRAMEWORKS_UPDATE);

  const framework = await repo.getFramework(input.reviewFrameworkId);
  if (!framework) throw new NotFoundError("That review framework doesn't exist.");
  assertFrameworkEditable(framework);

  const scale = await repo.createRatingScaleWithBands({
    reviewFrameworkId: framework.id,
    name: input.name,
    description: input.description,
    bands: input.bands.map((band) => ({
      value: new Prisma.Decimal(band.value),
      label: band.label,
      description: band.description,
      behavioralAnchor: band.behavioralAnchor,
      evidenceExpectation: band.evidenceExpectation,
      displayOrder: band.displayOrder,
    })),
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.REVIEW_FRAMEWORK_UPDATED,
    entityType: "ReviewFramework",
    entityId: framework.id,
    programmeId: framework.programmeId,
    cohortId: framework.cohortId ?? undefined,
    metadata: { action: "rating_scale_added", ratingScaleId: scale.id, name: scale.name },
  });

  return scale;
}

/**
 * Validates the complete framework (§8), then publishes it
 * transactionally: any other PUBLISHED framework for the same stage is
 * retired first (so "the active framework for a stage" is always
 * unambiguous — a deliberate decision, since the brief doesn't specify
 * whether multiple simultaneously-published versions are allowed; see
 * docs/REVIEW_FRAMEWORK.md), then this one is published, then the stage
 * itself is marked ACTIVE if it wasn't already. One audit entry per
 * framework touched.
 */
export async function publishReviewFramework(actorId: string, input: PublishReviewFrameworkInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.REVIEW_FRAMEWORKS_PUBLISH);

  const framework = await repo.getFramework(input.frameworkId);
  if (!framework) throw new NotFoundError("That review framework doesn't exist.");

  const result = validateFrameworkForPublish(framework, framework.reviewStage, framework.criteria, framework.ratingScales);
  if (!result.valid) {
    throw new InvalidReviewFrameworkError(
      `This framework can't be published: ${result.issues.map((i) => i.message).join(" ")}`,
    );
  }

  const now = new Date();
  const supersededIds = (await repo.findOtherPublishedFrameworksForStage(framework.reviewStageId, framework.id)).map(
    (f) => f.id,
  );

  await prisma.$transaction(async (tx) => {
    for (const supersededId of supersededIds) {
      await tx.reviewFramework.update({
        where: { id: supersededId },
        data: { status: "RETIRED", retiredById: actor.id, retiredAt: now },
      });
    }
    await tx.reviewFramework.update({
      where: { id: framework.id },
      data: {
        status: "PUBLISHED",
        totalConfiguredScore: result.totalConfiguredScore,
        publishedById: actor.id,
        publishedAt: now,
      },
    });
    // updateMany, not update: this is a conditional guard ("flip to
    // ACTIVE only if not already"), not a required single-row lookup —
    // `update()` throws P2025 when the extra `status` filter excludes
    // the only matching row (e.g. the stage is already ACTIVE from an
    // earlier publish), which isn't an error here, just a no-op.
    await tx.reviewStage.updateMany({
      where: { id: framework.reviewStageId, status: { not: "ACTIVE" } },
      data: { status: "ACTIVE" },
    });
  });

  for (const supersededId of supersededIds) {
    await writeAuditLog({
      actorId: actor.id,
      action: AUDIT_ACTIONS.REVIEW_FRAMEWORK_RETIRED,
      entityType: "ReviewFramework",
      entityId: supersededId,
      programmeId: framework.programmeId,
      cohortId: framework.cohortId ?? undefined,
      metadata: { reason: `Superseded by version ${framework.version}` },
    });
  }

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REVIEW_FRAMEWORK_PUBLISHED,
    entityType: "ReviewFramework",
    entityId: framework.id,
    programmeId: framework.programmeId,
    cohortId: framework.cohortId ?? undefined,
    metadata: { version: framework.version, totalConfiguredScore: result.totalConfiguredScore.toString() },
  });

  return repo.getFramework(framework.id);
}

export async function retireReviewFramework(actorId: string, input: RetireReviewFrameworkInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.REVIEW_FRAMEWORKS_RETIRE);

  const framework = await repo.getFramework(input.frameworkId);
  if (!framework) throw new NotFoundError("That review framework doesn't exist.");
  if (framework.status !== "PUBLISHED") {
    throw new FrameworkLockedError("Only a published framework can be retired.");
  }

  await repo.retireFrameworkRow(framework.id, { retiredById: actor.id, retiredAt: new Date() });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REVIEW_FRAMEWORK_RETIRED,
    entityType: "ReviewFramework",
    entityId: framework.id,
    programmeId: framework.programmeId,
    cohortId: framework.cohortId ?? undefined,
    metadata: { reason: input.reason ?? null },
  });

  return repo.getFramework(framework.id);
}
