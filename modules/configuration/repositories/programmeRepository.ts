import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProgrammeWindowCode } from "@/lib/generated/prisma/client";

export function getProgrammeWithActiveCohort(programmeId: string) {
  return prisma.programme.findUnique({
    where: { id: programmeId },
    include: {
      cohorts: { where: { isActive: true }, take: 1 },
      windows: true,
    },
  });
}

export function updateProgramme(programmeId: string, data: { name: string; code?: string }) {
  return prisma.programme.update({ where: { id: programmeId }, data });
}

export function updateCohort(
  cohortId: string,
  data: { name: string; year: number; applicationOpensAt?: Date | null; applicationClosesAt?: Date | null },
) {
  return prisma.cohort.update({ where: { id: cohortId }, data });
}

/**
 * `cohortId` is always a real id here, never null — Postgres treats NULL
 * as distinct from every other NULL in a unique constraint, so a
 * cohort-less row couldn't be reliably upserted against by identity.
 * This codebase runs one active cohort per programme (the same
 * convention every other module uses, `lib/cohort.ts`), so every window
 * this Configuration Centre writes is scoped to that cohort in practice
 * — the schema's nullable `cohortId` stays available for a future
 * programme-wide default, not exercised by this upsert path.
 */
export function upsertProgrammeWindow(
  programmeId: string,
  cohortId: string,
  code: ProgrammeWindowCode,
  data: { opensAt: Date | null; closesAt: Date | null },
) {
  return prisma.programmeWindow.upsert({
    where: { programmeId_cohortId_code: { programmeId, cohortId, code } },
    create: { programmeId, cohortId, code, ...data },
    update: data,
  });
}

export function getActiveApplicationReviewStage(programmeId: string, cohortId: string) {
  return prisma.reviewStage.findFirst({
    where: { programmeId, OR: [{ cohortId }, { cohortId: null }], status: "ACTIVE" },
    orderBy: { sequenceOrder: "asc" },
  });
}

export function updateReviewStageWindow(reviewStageId: string, data: { opensAt: Date | null; closesAt: Date | null }) {
  return prisma.reviewStage.update({ where: { id: reviewStageId }, data });
}
