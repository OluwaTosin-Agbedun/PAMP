-- Release 1 Module 1: Interview Assignment Engine — InterviewPanelist
-- reassignment-with-history fields (mirroring ReviewAssignment exactly),
-- InterviewerCapacity, InterviewConflictOfInterest.
--
-- The four DROP INDEX statements Prisma's raw diff proposed for the
-- pg_trgm search indexes (applicants_*_trgm_idx) are deliberately
-- excluded below — same recurring false positive documented in every
-- migration since the Phase 2 one.
--
-- interview_panelists_interviewId_userId_key IS dropped for real: the
-- plain @@unique([interviewId, userId]) constraint from the original
-- database-design migration is replaced below by a partial unique index
-- scoped to non-REASSIGNED/CANCELLED rows — the exact same pattern
-- Phase 3B used for review_assignments_applicationId_slot_active_key —
-- so a panelist reassigned off an interview can later be reassigned
-- back onto it without colliding with their own superseded row.

-- CreateEnum
CREATE TYPE "PanelistAssignmentStatus" AS ENUM ('ASSIGNED', 'REASSIGNED', 'CANCELLED');

-- DropIndex
DROP INDEX "interview_panelists_interviewId_userId_key";

-- AlterTable
ALTER TABLE "interview_panelists" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "assignedMethod" "AssignmentMethod" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "reassignReason" TEXT,
ADD COLUMN     "reassignedAt" TIMESTAMP(3),
ADD COLUMN     "reassignedById" TEXT,
ADD COLUMN     "reassignedFromId" TEXT,
ADD COLUMN     "status" "PanelistAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED';

-- CreateTable
CREATE TABLE "interviewer_capacities" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "maxConcurrentInterviews" INTEGER NOT NULL DEFAULT 10,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "unavailableReason" TEXT,
    "unavailableUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviewer_capacities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_conflicts_of_interest" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "ConflictSource" NOT NULL,
    "declaredById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_conflicts_of_interest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interviewer_capacities_interviewerId_programmeId_key" ON "interviewer_capacities"("interviewerId", "programmeId");

-- CreateIndex
CREATE INDEX "interview_conflicts_of_interest_applicationId_idx" ON "interview_conflicts_of_interest"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_conflicts_of_interest_interviewerId_applicationId_key" ON "interview_conflicts_of_interest"("interviewerId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_panelists_reassignedFromId_key" ON "interview_panelists"("reassignedFromId");

-- CreateIndex
CREATE INDEX "interview_panelists_interviewId_userId_idx" ON "interview_panelists"("interviewId", "userId");

-- CreateIndex
CREATE INDEX "interview_panelists_userId_idx" ON "interview_panelists"("userId");

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_reassignedFromId_fkey" FOREIGN KEY ("reassignedFromId") REFERENCES "interview_panelists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_reassignedById_fkey" FOREIGN KEY ("reassignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviewer_capacities" ADD CONSTRAINT "interviewer_capacities_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviewer_capacities" ADD CONSTRAINT "interviewer_capacities_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_conflicts_of_interest" ADD CONSTRAINT "interview_conflicts_of_interest_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_conflicts_of_interest" ADD CONSTRAINT "interview_conflicts_of_interest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_conflicts_of_interest" ADD CONSTRAINT "interview_conflicts_of_interest_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Partial unique index (not expressible via @@unique — see this
-- migration's header comment): only one *active* panelist row per
-- (interviewId, userId) at a time; a REASSIGNED/CANCELLED row is
-- history, not a live seat, so it's excluded from the uniqueness check.
CREATE UNIQUE INDEX "interview_panelists_interviewId_userId_active_key" ON "interview_panelists"("interviewId", "userId") WHERE "status" NOT IN ('REASSIGNED', 'CANCELLED');
