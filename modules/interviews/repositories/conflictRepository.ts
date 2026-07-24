import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ConflictSource } from "@/lib/generated/prisma/client";

export function createConflict(data: {
  interviewerId: string;
  applicationId: string;
  reason: string;
  source: ConflictSource;
  declaredById: string;
  expiresAt?: Date | null;
}) {
  return prisma.interviewConflictOfInterest.create({ data });
}

export function listConflictsForApplication(applicationId: string) {
  return prisma.interviewConflictOfInterest.findMany({
    where: { applicationId },
    include: { interviewer: { select: { id: true, name: true } }, declaredBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export function listConflictsForInterviewers(applicationId: string, interviewerIds: string[]) {
  return prisma.interviewConflictOfInterest.findMany({
    where: { applicationId, interviewerId: { in: interviewerIds } },
  });
}
