import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { NoteVisibility } from "@/lib/generated/prisma/client";

/** Pure data access for Note — the pre-existing, previously-unused model from the database-design phase (docs/database.md). */

export function createNote(data: { applicationId: string; authorId: string; body: string; visibility: NoteVisibility }) {
  return prisma.note.create({ data });
}

export function listNotesForApplication(applicationId: string) {
  return prisma.note.findMany({
    where: { applicationId, deletedAt: null },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
