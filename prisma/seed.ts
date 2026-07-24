import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";
import { seedApplicationReviewCriteria } from "../modules/reviews/seed/seedApplicationReviewCriteria";
import { seedApplicationReviewStage } from "../modules/reviews/seed/seedApplicationReviewStage";
import { seedInterviewCriteria } from "../modules/interviews/seed/seedInterviewCriteria";
import { seedNotificationTemplates } from "../modules/notifications/seed/seedNotificationTemplates";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const name = process.env.SEED_ADMIN_NAME;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD must be set to seed the bootstrap System Administrator.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name,
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

  const cohortYear = Number(process.env.SEED_COHORT_YEAR ?? "2026");
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
