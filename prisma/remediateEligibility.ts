import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * §10 Existing Applicant Remediation — the actual data fix for the bug
 * this module was built to correct. Talks to Prisma directly rather
 * than importing `modules/eligibility/screeningService.ts`'s
 * `remediateExistingApplications` — that module is guarded with `import
 * "server-only"`, which can't resolve when this runs as a plain `tsx`
 * script outside Next's bundler (the same constraint every other
 * `prisma/*.ts` seed/backfill script in this repo already works around).
 * The logic is identical to that function; kept in sync manually since
 * duplicating a few lines here is safer than weakening the service
 * layer's guard for one script.
 *
 * Only ever touches an application that was auto-approved by the old
 * vacuous-pass engine and never actually decided by a human — a
 * legitimate, screener-confirmed decision is never touched. Idempotent:
 * a remediated application's `eligibilityStatus` becomes `PENDING`,
 * which no longer matches this script's own selection criteria.
 */
async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SYSTEM_ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("No System Administrator account found to attribute this remediation to.");

  const cohorts = await prisma.cohort.findMany({ where: { isActive: true } });

  let totalScanned = 0;
  let totalRemediated = 0;

  for (const cohort of cohorts) {
    const candidates = await prisma.application.findMany({
      where: {
        cohortId: cohort.id,
        eligibilityStatus: { in: ["ELIGIBLE", "INELIGIBLE"] },
        OR: [{ eligibilityScreening: null }, { eligibilityScreening: { decidedById: null } }],
      },
      select: { id: true, eligibilityStatus: true, stage: true },
    });

    for (const application of candidates) {
      await prisma.$transaction(async (tx) => {
        await tx.eligibilityScreening.upsert({
          where: { applicationId: application.id },
          update: {},
          create: { applicationId: application.id },
        });
        await tx.application.update({
          where: { id: application.id },
          data: { eligibilityStatus: "PENDING", stage: application.stage === "UNDER_REVIEW" ? "IMPORTED" : application.stage },
        });
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: "ELIGIBILITY_REMEDIATED",
            entityType: "Application",
            entityId: application.id,
            metadata: { previousEligibilityStatus: application.eligibilityStatus, source: "vacuous_auto_engine_remediation" },
            cohortId: cohort.id,
          },
        });
      });
      totalRemediated++;
    }

    totalScanned += candidates.length;
    console.log(`${cohort.name}: scanned ${candidates.length}, remediated ${candidates.length}`);
  }

  console.log(`Total scanned: ${totalScanned}`);
  console.log(`Total remediated: ${totalRemediated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
