import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * "Give me everything that happened around this application's review
 * process" (Phase 3D §"AUDIT"). `AuditLog` rows are written against
 * whatever entity the action was actually about — `ReviewAssignment`,
 * `Review`, `ReviewConflictOfInterest`, `Note`, or `Application` itself
 * (see each write site: `modules/reviews/services/assignmentService.ts`,
 * `modules/reviews/services/reviewService.ts`, `modules/notes/service.ts`)
 * — so a complete application-scoped trail means collecting every entity
 * id tied to this application first, then querying `AuditLog` across all
 * of them in one call, not just `entityType: "Application"`.
 */
export async function listAuditEventsForApplication(applicationId: string) {
  const [assignments, conflicts, notes, escalations] = await Promise.all([
    prisma.reviewAssignment.findMany({ where: { applicationId }, select: { id: true } }),
    prisma.reviewConflictOfInterest.findMany({ where: { applicationId }, select: { id: true } }),
    prisma.note.findMany({ where: { applicationId }, select: { id: true } }),
    prisma.reviewEscalation.findMany({ where: { applicationId }, select: { id: true } }),
  ]);
  const assignmentIds = assignments.map((a) => a.id);

  const reviews = assignmentIds.length
    ? await prisma.review.findMany({ where: { reviewAssignmentId: { in: assignmentIds } }, select: { id: true } })
    : [];

  return prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Application", entityId: applicationId },
        { entityType: "ReviewAssignment", entityId: { in: assignmentIds } },
        { entityType: "Review", entityId: { in: reviews.map((r) => r.id) } },
        { entityType: "ReviewConflictOfInterest", entityId: { in: conflicts.map((c) => c.id) } },
        { entityType: "ReviewEscalation", entityId: { in: escalations.map((e) => e.id) } },
        { entityType: "Note", entityId: { in: notes.map((n) => n.id) } },
      ],
    },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
