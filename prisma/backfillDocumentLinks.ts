import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { splitExtraIntoTextAndDocuments } from "../modules/import/mapping";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * One-time backfill for applications imported before
 * `splitExtraIntoTextAndDocuments` existed — every application whose
 * `essayAnswers` still contains a document-shaped (bare URL) value gets
 * that value moved into `ApplicationDocument`, exactly as a fresh
 * import now does at write time (`modules/import/service.ts`). Safe to
 * re-run: skips any (applicationId, type) pair that already has a
 * document row, so running this twice never creates duplicates, and an
 * application with nothing document-shaped in its `essayAnswers` is
 * left untouched.
 */
async function main() {
  // Fetched unfiltered and checked in-memory below rather than querying
  // by JSON nullness — Prisma's JsonNull/DbNull distinction is easy to
  // get subtly wrong, and this table's size (one row per application)
  // never justifies the extra care to avoid an in-memory pass.
  const applications = await prisma.application.findMany({
    select: { id: true, essayAnswers: true },
  });

  let applicationsUpdated = 0;
  let documentsCreated = 0;

  for (const application of applications) {
    const extra = (application.essayAnswers as Record<string, string> | null) ?? {};
    const { essayAnswers, documents } = splitExtraIntoTextAndDocuments(extra);
    if (documents.length === 0) continue;

    const existing = await prisma.applicationDocument.findMany({
      where: { applicationId: application.id, type: { in: documents.map((d) => d.type) } },
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((d) => d.type));
    const toCreate = documents.filter((d) => !existingTypes.has(d.type));

    await prisma.$transaction([
      ...(toCreate.length > 0
        ? [prisma.applicationDocument.createMany({ data: toCreate.map((d) => ({ applicationId: application.id, ...d })) })]
        : []),
      prisma.application.update({ where: { id: application.id }, data: { essayAnswers } }),
    ]);

    applicationsUpdated++;
    documentsCreated += toCreate.length;
  }

  console.log(`Applications scanned: ${applications.length}`);
  console.log(`Applications updated: ${applicationsUpdated}`);
  console.log(`Documents created: ${documentsCreated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
