-- Release 1 — Interview Scheduling (Enterprise Functional Specification
-- Addendum). Generated via `prisma migrate diff --from-config-datasource
-- --to-schema prisma/schema.prisma --script`, with the four recurring
-- `DROP INDEX applicants_*_trgm_idx` statements removed — a known false
-- positive of the diff tool against this database's manually-created
-- pg_trgm GIN indexes (present in every migration since Sequence 1),
-- not a real schema drift.

-- CreateEnum
CREATE TYPE "InterviewBookingStatus" AS ENUM ('AWAITING_SLOTS', 'SLOTS_PUBLISHED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "InterviewSlotStatus" AS ENUM ('OPEN', 'SELECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'LEAVE');

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "bookingStatus" "InterviewBookingStatus" NOT NULL DEFAULT 'AWAITING_SLOTS',
ADD COLUMN     "bookingTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "bookingTokenHash" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "declinedById" TEXT,
ADD COLUMN     "invitationsSentAt" TIMESTAMP(3),
ADD COLUMN     "selectedSlotId" TEXT,
ADD COLUMN     "teamsLink" TEXT,
ADD COLUMN     "teamsLinkAddedAt" TIMESTAMP(3),
ADD COLUMN     "teamsLinkAddedById" TEXT,
ALTER COLUMN "scheduledAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "interview_slots" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "InterviewSlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviewer_availability" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "type" "AvailabilityType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviewer_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_slots_interviewId_status_idx" ON "interview_slots"("interviewId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "interview_slots_interviewId_startsAt_key" ON "interview_slots"("interviewId", "startsAt");

-- CreateIndex
CREATE INDEX "interviewer_availability_interviewerId_cohortId_idx" ON "interviewer_availability"("interviewerId", "cohortId");

-- CreateIndex
CREATE INDEX "interviewer_availability_cohortId_startsAt_idx" ON "interviewer_availability"("cohortId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_selectedSlotId_key" ON "interviews"("selectedSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_bookingTokenHash_key" ON "interviews"("bookingTokenHash");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_selectedSlotId_fkey" FOREIGN KEY ("selectedSlotId") REFERENCES "interview_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_teamsLinkAddedById_fkey" FOREIGN KEY ("teamsLinkAddedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_declinedById_fkey" FOREIGN KEY ("declinedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviewer_availability" ADD CONSTRAINT "interviewer_availability_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviewer_availability" ADD CONSTRAINT "interviewer_availability_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
