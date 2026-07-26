import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";
import { seedApplicationReviewCriteria } from "../modules/reviews/seed/seedApplicationReviewCriteria";
import { seedApplicationReviewStage } from "../modules/reviews/seed/seedApplicationReviewStage";
import { seedInterviewCriteria } from "../modules/interviews/seed/seedInterviewCriteria";
import { seedNotificationTemplates } from "../modules/notifications/seed/seedNotificationTemplates";

/**
 * The bootstrap logic — self-contained (own PrismaClient, connects and
 * disconnects within the call) so it's safely callable both from the CLI
 * entry point (prisma/seedCli.ts, the `npm run db:seed` path) and from a
 * one-time authenticated route when a production database's credentials
 * aren't retrievable locally (see docs/DEPLOYMENT_TROUBLESHOOTING.md) —
 * both paths run this identical, already-idempotent logic, never a
 * reimplementation of it. Deliberately has no module-level side effects
 * (no auto-running `main()`) so importing it — e.g. from an API route —
 * never triggers a CLI-only code path.
 */
export async function runSeed(adminInput: { name: string; email: string; password: string }, cohortYear = 2026) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const email = adminInput.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(adminInput.password, 12);

    const admin = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: adminInput.name,
        email,
        passwordHash,
        role: Role.SYSTEM_ADMIN,
      },
    });

    console.log(`System Administrator ready: ${admin.email}`);

    const programme = await prisma.programme.upsert({
      where: { slug: "pam-p" },
      update: {},
      create: { name: "Pius Anyim Mentorship Programme", slug: "pam-p" },
    });

    const existingActiveCohort = await prisma.cohort.findFirst({ where: { isActive: true } });

    let cohort = existingActiveCohort;
    if (!cohort) {
      cohort = await prisma.cohort.create({
        data: { programmeId: programme.id, name: `PAM-P ${cohortYear}`, year: cohortYear, isActive: true },
      });
      console.log(`Active cohort ready: ${cohort.name}`);
    } else {
      console.log(`Active cohort already exists: ${cohort.name}`);
    }

    const reviewStage = await seedApplicationReviewStage(prisma, programme.id);
    console.log(
      reviewStage.created
        ? "Application Review stage ready (max score 60)."
        : "Application Review stage already exists.",
    );

    const reviewCriteria = await seedApplicationReviewCriteria(prisma, reviewStage.stageId, admin.id);
    console.log(
      reviewCriteria.created
        ? `Application Review framework seeded and published (total ${reviewCriteria.totalConfiguredScore}/60).`
        : `Application Review framework already published (total ${reviewCriteria.totalConfiguredScore}/60).`,
    );

    const interviewCriteria = await seedInterviewCriteria(prisma, cohort.id);
    console.log(
      interviewCriteria.created > 0
        ? `Panel Interview criteria seeded (total ${interviewCriteria.totalConfiguredScore}/40).`
        : `Panel Interview criteria already seeded (total ${interviewCriteria.totalConfiguredScore}/40).`,
    );

    const notificationTemplates = await seedNotificationTemplates(prisma, admin.id);
    console.log(
      `Notification templates: ${notificationTemplates.created} created, ${notificationTemplates.alreadyExisted} already existed.`,
    );

    return { adminEmail: admin.email };
  } finally {
    await prisma.$disconnect();
  }
}
