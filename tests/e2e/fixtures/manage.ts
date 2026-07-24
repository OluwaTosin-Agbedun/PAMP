import "dotenv/config";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, randomBytes, createHash } from "node:crypto";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, Prisma } from "../../../lib/generated/prisma/client";

/**
 * Fixture setup/teardown for tests/e2e/reviewOperations.spec.ts, run as a
 * separate `tsx` subprocess (see that file's top-of-file comment for
 * why) — Playwright's own spec-file transform can't load this project's
 * ESM-only generated Prisma client directly (`import.meta` usage throws
 * under its CJS-style bundling), but a real `tsx`-run Node process
 * handles it exactly the way `npx tsx <script>.ts` already does
 * elsewhere in this repo's manual verification workflow.
 */

const FIXTURE_FILE = join(process.cwd(), "tests/e2e/fixtures/.fixture.json");
const PASSWORD = "Correct-Horse9!";
const TEST_DOMAIN = "@e2e.pam-p.invalid";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function setup() {
  const suffix = randomUUID().slice(0, 8);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "SYSTEM_ADMIN" } });

  const secretary = await prisma.user.create({
    data: { name: "E2E Secretary", email: `secretary-${suffix}${TEST_DOMAIN}`, passwordHash, role: "PROGRAMME_SECRETARY", status: "ACTIVE", mustChangePassword: false },
  });
  const reviewerOne = await prisma.user.create({
    data: { name: "E2E Reviewer One", email: `r1-${suffix}${TEST_DOMAIN}`, passwordHash, role: "APPLICATION_REVIEWER", status: "ACTIVE", mustChangePassword: false },
  });
  const reviewerTwo = await prisma.user.create({
    data: { name: "E2E Reviewer Two", email: `r2-${suffix}${TEST_DOMAIN}`, passwordHash, role: "APPLICATION_REVIEWER", status: "ACTIVE", mustChangePassword: false },
  });
  const reviewerThree = await prisma.user.create({
    data: { name: "E2E Reviewer Three", email: `r3-${suffix}${TEST_DOMAIN}`, passwordHash, role: "APPLICATION_REVIEWER", status: "ACTIVE", mustChangePassword: false },
  });
  const blockedReviewer = await prisma.user.create({
    data: { name: "E2E Blocked Reviewer", email: `blocked-${suffix}${TEST_DOMAIN}`, passwordHash, role: "APPLICATION_REVIEWER", status: "ACTIVE", mustChangePassword: false },
  });
  const interviewer = await prisma.user.create({
    data: { name: "E2E Interviewer", email: `interviewer-${suffix}${TEST_DOMAIN}`, passwordHash, role: "INTERVIEWER", status: "ACTIVE", mustChangePassword: false },
  });

  const programme = await prisma.programme.create({ data: { name: `E2E Programme ${suffix}`, slug: `e2e-programme-${suffix}` } });
  const cohort = await prisma.cohort.create({ data: { programmeId: programme.id, name: "E2E Cohort", year: 2099, isActive: false } });

  const stage = await prisma.reviewStage.create({
    data: {
      programmeId: programme.id,
      cohortId: cohort.id,
      name: "E2E Application Review",
      code: `E2E_${suffix}`,
      maxTotalScore: new Prisma.Decimal(100),
      status: "ACTIVE",
    },
  });
  const framework = await prisma.reviewFramework.create({
    data: { reviewStageId: stage.id, programmeId: programme.id, cohortId: cohort.id, version: 1, status: "DRAFT" },
  });
  const criterion = await prisma.reviewCriterion.create({
    data: {
      reviewFrameworkId: framework.id,
      code: "OVERALL",
      label: "Overall",
      maxScore: new Prisma.Decimal(100),
      minScore: new Prisma.Decimal(0),
      weight: new Prisma.Decimal(1),
      isMandatory: true,
      isCommentMandatory: false,
      allowDecimalScores: true,
      displayOrder: 0,
    },
  });
  await prisma.reviewFramework.update({
    where: { id: framework.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: admin.id, totalConfiguredScore: new Prisma.Decimal(100) },
  });

  async function makeApplicant(label: string) {
    const applicant = await prisma.applicant.create({
      data: { cohortId: cohort.id, firstName: "E2E", lastName: label, email: `${label.toLowerCase()}-${suffix}@test.pam-p.invalid` },
    });
    return prisma.application.create({
      data: { applicantId: applicant.id, cohortId: cohort.id, eligibilityStatus: "ELIGIBLE", stage: "UNDER_REVIEW" },
    });
  }

  const submittedApp = await makeApplicant("Submitted");
  const sa1 = await prisma.reviewAssignment.create({
    data: { applicationId: submittedApp.id, reviewerId: reviewerOne.id, slot: "FIRST", assignedMethod: "MANUAL" },
  });
  const sa2 = await prisma.reviewAssignment.create({
    data: { applicationId: submittedApp.id, reviewerId: reviewerTwo.id, slot: "SECOND", assignedMethod: "MANUAL" },
  });
  for (const [assignment, reviewerId, score] of [
    [sa1, reviewerOne.id, "80"],
    [sa2, reviewerTwo.id, "82"],
  ] as const) {
    const review = await prisma.review.create({
      data: {
        reviewAssignmentId: assignment.id,
        applicationId: submittedApp.id,
        reviewerId,
        reviewFrameworkId: framework.id,
        status: "SUBMITTED",
        totalScore: new Prisma.Decimal(score),
        comments: `E2E reviewer comment (${score}).`,
        submittedAt: new Date(),
      },
    });
    await prisma.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: new Prisma.Decimal(score) } });
    await prisma.reviewAssignment.update({ where: { id: assignment.id }, data: { status: "COMPLETED" } });
  }

  const awaitingApp = await makeApplicant("Awaiting");

  const pendingApp = await makeApplicant("Pending");
  const pendingAssignment = await prisma.reviewAssignment.create({
    data: { applicationId: pendingApp.id, reviewerId: reviewerThree.id, slot: "FIRST", assignedMethod: "MANUAL" },
  });

  // Release 1 Module 2 — a scheduled interview with one active panel
  // seat, for the Interview Workspace accessibility scan. Created
  // directly rather than via the assignment engine — this is a fixture,
  // not a test of the engine itself.
  await prisma.interviewCriterion.create({
    data: { cohortId: cohort.id, label: "Overall impression", maxScore: new Prisma.Decimal(10), weight: new Prisma.Decimal(1), order: 0 },
  });
  const interview = await prisma.interview.create({
    data: { applicationId: awaitingApp.id, cohortId: cohort.id, scheduledAt: new Date(Date.now() + 86_400_000) },
  });
  await prisma.interviewPanelist.create({
    data: { interviewId: interview.id, userId: interviewer.id, assignedMethod: "MANUAL", status: "ASSIGNED" },
  });

  // Interview Scheduling (Enterprise Functional Specification Addendum)
  // — a second, shell interview with published candidate slots and a
  // known booking token, for the scheduling-operator and public
  // booking-page accessibility scans.
  const schedulingApp = await makeApplicant("Scheduling");
  const schedulingInterview = await prisma.interview.create({
    data: { applicationId: schedulingApp.id, cohortId: cohort.id, scheduledAt: null },
  });
  await prisma.interviewPanelist.create({
    data: { interviewId: schedulingInterview.id, userId: interviewer.id, assignedMethod: "MANUAL", status: "ASSIGNED" },
  });
  const slotStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.interviewSlot.create({
    data: { interviewId: schedulingInterview.id, startsAt: slotStart, endsAt: new Date(slotStart.getTime() + 30 * 60 * 1000) },
  });
  const rawBookingToken = randomBytes(32).toString("base64url");
  await prisma.interview.update({
    where: { id: schedulingInterview.id },
    data: {
      bookingStatus: "SLOTS_PUBLISHED",
      bookingTokenHash: createHash("sha256").update(rawBookingToken).digest("hex"),
      bookingTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.cohort.updateMany({ where: { isActive: true }, data: { isActive: false } });
  await prisma.cohort.update({ where: { id: cohort.id }, data: { isActive: true } });

  const fixture = {
    programmeId: programme.id,
    cohortId: cohort.id,
    criterionId: criterion.id,
    secretaryEmail: secretary.email,
    reviewerOneId: reviewerOne.id,
    reviewerTwoId: reviewerTwo.id,
    reviewerThreeId: reviewerThree.id,
    blockedReviewerEmail: blockedReviewer.email,
    submittedApplicationId: submittedApp.id,
    awaitingApplicationId: awaitingApp.id,
    pendingAssignmentId: pendingAssignment.id,
    pendingApplicationId: pendingApp.id,
    interviewerEmail: interviewer.email,
    interviewId: interview.id,
    schedulingInterviewId: schedulingInterview.id,
    bookingToken: rawBookingToken,
  };

  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify(fixture));
}

async function teardown() {
  if (!existsSync(FIXTURE_FILE)) return;
  const fixture = JSON.parse(readFileSync(FIXTURE_FILE, "utf-8"));

  const cohorts = await prisma.cohort.findMany({ where: { programmeId: fixture.programmeId }, select: { id: true } });
  const cohortIds = cohorts.map((c: { id: string }) => c.id);
  if (cohortIds.length > 0) {
    // Application cascade-deletes Interview -> InterviewPanelist/
    // InterviewScore, which must happen before InterviewCriterion can be
    // deleted (InterviewScoreEntry's FK to InterviewCriterion has no
    // cascade of its own).
    await prisma.application.deleteMany({ where: { cohortId: { in: cohortIds } } });
    await prisma.applicant.deleteMany({ where: { cohortId: { in: cohortIds } } });
    await prisma.interviewCriterion.deleteMany({ where: { cohortId: { in: cohortIds } } });
  }
  await prisma.reviewerCapacity.deleteMany({ where: { programmeId: fixture.programmeId } });
  await prisma.reviewFramework.deleteMany({ where: { programmeId: fixture.programmeId } });
  await prisma.reviewStage.deleteMany({ where: { programmeId: fixture.programmeId } });
  await prisma.auditLog.deleteMany({ where: { programmeId: fixture.programmeId } });
  await prisma.cohort.deleteMany({ where: { programmeId: fixture.programmeId } });
  await prisma.programme.delete({ where: { id: fixture.programmeId } });

  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });

  const anyCohort = await prisma.cohort.findFirst();
  if (anyCohort) await prisma.cohort.update({ where: { id: anyCohort.id }, data: { isActive: true } });

  unlinkSync(FIXTURE_FILE);
}

async function checkReassignment() {
  const fixture = JSON.parse(readFileSync(FIXTURE_FILE, "utf-8"));
  const assignment = await prisma.reviewAssignment.findUniqueOrThrow({ where: { id: fixture.pendingAssignmentId } });
  console.log(JSON.stringify({ status: assignment.status, reviewerId: assignment.reviewerId }));
}

const mode = process.argv[2];

const run = mode === "teardown" ? teardown() : mode === "check-reassignment" ? checkReassignment() : setup();

run
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
