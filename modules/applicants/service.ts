import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { NotFoundError } from "@/lib/errors/AppError";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import { getApplicationDetail, softDeleteApplication } from "./repository";

export async function deleteApplicant(actorId: string, applicationId: string, reason: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.APPLICATIONS_DELETE);

  const application = await getApplicationDetail(applicationId);
  if (!application || application.deletedAt) {
    throw new NotFoundError("That applicant couldn't be found.");
  }

  await softDeleteApplication(applicationId);

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.APPLICANT_DELETED,
    entityType: "Application",
    entityId: applicationId,
    metadata: {
      reason,
      applicantName: `${application.applicant.firstName} ${application.applicant.lastName}`,
      applicantEmail: application.applicant.email,
    },
  });
}
