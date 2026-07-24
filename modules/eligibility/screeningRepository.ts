import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ChecklistItemStatus, ChecklistSection, Prisma, ScreeningNextAction, ScreeningStatus } from "@/lib/generated/prisma/client";

const SCREENING_INCLUDE = {
  application: { include: { applicant: true, documents: true } },
  screener: { select: { id: true, name: true } },
  assignedBy: { select: { id: true, name: true } },
  secondReviewer: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
  checklistItems: { include: { updatedBy: { select: { id: true, name: true } } } },
} satisfies Prisma.EligibilityScreeningInclude;

export function getScreeningByApplicationId(applicationId: string) {
  return prisma.eligibilityScreening.findUnique({ where: { applicationId }, include: SCREENING_INCLUDE });
}

export function getScreeningById(id: string) {
  return prisma.eligibilityScreening.findUnique({ where: { id }, include: SCREENING_INCLUDE });
}

/** Idempotent — every application should have exactly one screening record, created the moment it exists. */
export async function ensureScreeningExists(applicationId: string) {
  return prisma.eligibilityScreening.upsert({
    where: { applicationId },
    update: {},
    create: { applicationId },
  });
}

export function listScreeningsForCohort(
  cohortId: string,
  filters: {
    status?: ScreeningStatus;
    screenerId?: string | "UNASSIGNED";
    missingDocuments?: boolean;
    integrityFlagged?: boolean;
  },
) {
  return prisma.eligibilityScreening.findMany({
    where: {
      application: { cohortId, deletedAt: null },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.screenerId === "UNASSIGNED"
        ? { screenerId: null }
        : filters.screenerId
          ? { screenerId: filters.screenerId }
          : {}),
    },
    include: SCREENING_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

export function upsertChecklistItem(
  tx: Prisma.TransactionClient | typeof prisma,
  screeningId: string,
  section: ChecklistSection,
  itemKey: string,
  data: { status: ChecklistItemStatus | null; comment: string | null; isAutomatic: boolean; updatedById: string | null },
) {
  return tx.eligibilityChecklistItem.upsert({
    where: { screeningId_section_itemKey: { screeningId, section, itemKey } },
    create: { screeningId, section, itemKey, ...data },
    update: data,
  });
}

export function assignScreener(
  id: string,
  data: { screenerId: string; assignedById: string; status: ScreeningStatus },
) {
  return prisma.eligibilityScreening.update({
    where: { id },
    data: { screenerId: data.screenerId, assignedById: data.assignedById, assignedAt: new Date(), status: data.status },
  });
}

/**
 * The automatic-random-assignment path's write — conditioned on
 * `screenerId: null` so it's safe to call repeatedly (e.g. the
 * automatic eligibility engine re-running on a still-unresolved
 * Clarification Required case must never reshuffle who's already
 * working it). Returns whether it actually assigned anything, so the
 * caller can tell "already had a screener" apart from "assigned now."
 * `assignedById: null` marks it as system-initiated, the same
 * convention `recordDecision`'s `decidedById: null` uses.
 */
export async function assignScreenerIfUnassigned(
  id: string,
  data: { screenerId: string; status: ScreeningStatus },
): Promise<boolean> {
  const result = await prisma.eligibilityScreening.updateMany({
    where: { id, screenerId: null },
    data: { screenerId: data.screenerId, assignedById: null, assignedAt: new Date(), status: data.status },
  });
  return result.count > 0;
}

export function recordDecision(
  id: string,
  data: {
    status: ScreeningStatus;
    nextAction: ScreeningNextAction;
    reasonForDecision?: string | null;
    outstandingClarification?: string | null;
    integrityNote?: string | null;
    secondReviewRequired?: boolean;
    /** `null` for a system-decided (automatic engine) outcome — `EligibilityScreening.decidedById` is nullable for exactly this. */
    decidedById: string | null;
    /** Only meaningful alongside `status: "CLARIFICATION_REQUIRED"`.
     *  Defaults to `null` for every other status, so leaving Clarification
     *  Required by any path (a screener's own decision, the automatic
     *  engine, or a Secretariat override) always clears a stale deadline
     *  rather than leaving it to be picked up incorrectly later. */
    clarificationDeadlineAt?: Date | null;
  },
) {
  return prisma.eligibilityScreening.update({
    where: { id },
    data: {
      status: data.status,
      nextAction: data.nextAction,
      reasonForDecision: data.reasonForDecision,
      outstandingClarification: data.outstandingClarification,
      integrityNote: data.integrityNote,
      secondReviewRequired: data.secondReviewRequired ?? false,
      decidedById: data.decidedById,
      decidedAt: new Date(),
      dateReviewed: new Date(),
      clarificationDeadlineAt: data.clarificationDeadlineAt ?? null,
    },
  });
}

export function recordSecondReview(id: string, data: { secondReviewerId: string; secondReviewNote: string | null }) {
  return prisma.eligibilityScreening.update({
    where: { id },
    data: { secondReviewerId: data.secondReviewerId, secondReviewCompletedAt: new Date(), secondReviewNote: data.secondReviewNote },
  });
}

export function reopenScreening(id: string, data: { reopenedById: string; reopenReason: string; status: ScreeningStatus }) {
  return prisma.eligibilityScreening.update({
    where: { id },
    data: {
      status: data.status,
      reopenedById: data.reopenedById,
      reopenedAt: new Date(),
      reopenReason: data.reopenReason,
      decidedById: null,
      decidedAt: null,
    },
  });
}

export function extendClarificationDeadline(
  id: string,
  data: { newDeadlineAt: Date; extendedById: string; reason: string },
) {
  return prisma.eligibilityScreening.update({
    where: { id },
    data: {
      clarificationDeadlineAt: data.newDeadlineAt,
      clarificationDeadlineExtendedById: data.extendedById,
      clarificationDeadlineExtendedAt: new Date(),
      clarificationDeadlineExtensionReason: data.reason,
    },
  });
}

/** Everything still sitting `CLARIFICATION_REQUIRED` past its deadline — `checkMissedClarificationDeadlines`'s candidate set. */
export function listExpiredClarifications(asOf: Date) {
  return prisma.eligibilityScreening.findMany({
    where: { status: "CLARIFICATION_REQUIRED", clarificationDeadlineAt: { lt: asOf } },
    select: { id: true, applicationId: true },
  });
}

export function updateApplicationEligibilityStatus(
  tx: Prisma.TransactionClient | typeof prisma,
  applicationId: string,
  data: { eligibilityStatus: Prisma.ApplicationUpdateInput["eligibilityStatus"]; stage?: Prisma.ApplicationUpdateInput["stage"] },
) {
  return tx.application.update({ where: { id: applicationId }, data });
}
