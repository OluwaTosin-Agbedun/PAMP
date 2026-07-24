import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as repo from "./repository";

/**
 * Administrative notes (Phase 3D §"ADMINISTRATIVE NOTES") — a
 * Secretariat-authored, timestamped, attributed, non-destructive record
 * on an application, kept separate from a reviewer's own review comments
 * (`Review.comments`/`ReviewScore.comment`, a different table entirely —
 * an administrative note can never modify, replace, or even reference a
 * scoring outcome). Reuses the `Note` model from the database-design
 * phase (docs/database.md), previously defined but never written to —
 * `visibility: "ALL_STAFF"` for every note this phase creates, since no
 * reviewer-facing Notes UI exists yet to make a narrower visibility
 * value meaningful (see docs/PROGRAMME_SECRETARIAT_WORKSPACE.md).
 */
export async function createAdministrativeNote(actorId: string, applicationId: string, body: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.ADMINISTRATIVE_NOTES_CREATE);

  const application = await prisma.application.findUnique({ where: { id: applicationId }, select: { id: true } });
  if (!application) throw new NotFoundError("That application doesn't exist.");

  const note = await repo.createNote({
    applicationId,
    authorId: actor.id,
    body,
    visibility: "ALL_STAFF",
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ADMINISTRATIVE_NOTE_CREATED,
    entityType: "Note",
    entityId: note.id,
    metadata: { applicationId },
  });

  return note;
}

export async function listAdministrativeNotes(actorId: string, applicationId: string) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_OPERATIONS_VIEW);
  return repo.listNotesForApplication(applicationId);
}
