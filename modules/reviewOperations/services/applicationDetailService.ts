import "server-only";

import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as detailRepo from "../repositories/applicationDetailRepository";
import { listActiveApplicationReviewers } from "../repositories/assignmentMonitoringRepository";
import * as auditRepo from "../repositories/auditTrailRepository";
import { listAdministrativeNotes } from "@/modules/notes/service";

/**
 * The application-level Secretariat view (Phase 3D): assignments with
 * each reviewer's *own* score/comment shown side by side — this is the
 * one place in the codebase that's allowed to do that, because the
 * Secretariat is oversight, not a peer reviewer (§"Comments and score
 * visibility" — "Keep Reviewer 1 and Reviewer 2 blind to each other" is
 * a rule about reviewers, not about this screen; see
 * docs/PROGRAMME_SECRETARIAT_WORKSPACE.md for why that's not a
 * contradiction). Every figure shown is read directly off `Review`/
 * `ReviewEscalation` rows already computed and stored by Phase 3A/3B —
 * nothing here recalculates a score.
 */
export async function getApplicationOperationsDetail(actorId: string, applicationId: string) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_OPERATIONS_VIEW);

  const application = await detailRepo.getApplicationForOperations(applicationId);
  if (!application) throw new NotFoundError("That application doesn't exist.");

  const [activeAssignments, assignmentHistory, conflicts, escalation, notes, auditEvents, availableReviewers] =
    await Promise.all([
      detailRepo.listActiveAssignmentsForApplication(applicationId),
      detailRepo.listAllAssignmentsHistoryForApplication(applicationId),
      detailRepo.listConflictsForApplication(applicationId),
      detailRepo.getEscalationForApplication(applicationId),
      listAdministrativeNotes(actorId, applicationId),
      auditRepo.listAuditEventsForApplication(applicationId),
      listActiveApplicationReviewers(),
    ]);

  return { application, activeAssignments, assignmentHistory, conflicts, escalation, notes, auditEvents, availableReviewers };
}
