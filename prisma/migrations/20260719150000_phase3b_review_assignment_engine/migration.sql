-- Phase 3B: review assignment engine and blind review orchestration.
--
-- review_assignments has 8 real rows at the time of this migration (from
-- Sequence 1's live auto-assignment, confirmed via direct query) — the
-- new "status" column's DEFAULT 'ASSIGNED' is the objectively correct
-- backfill value for every one of them (they are, in fact, all still
-- actively assigned; none has been submitted, cancelled, or reassigned
-- yet, since `reviews` is still empty), so no special backfill logic is
-- needed here, unlike the User.isActive -> status migration in Phase 2.
--
-- The pg_trgm search index DROP statements Prisma's raw diff proposed
-- (applicants_*_trgm_idx) are excluded below, same false positive
-- documented in the Phase 2 and Phase 3A migrations.
--
-- review_assignments_applicationId_slot_key IS dropped deliberately
-- (not a false positive this time) and replaced with a partial unique
-- index further down — see the schema doc comment on ReviewAssignment
-- and docs/REVIEW_ASSIGNMENT_ENGINE.md for why.

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'ESCALATED', 'REASSIGNED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ConflictSource" AS ENUM ('SELF_DECLARED', 'ADMIN_RECORDED');

-- DropIndex
DROP INDEX "review_assignments_applicationId_slot_key";

-- AlterTable
ALTER TABLE "review_assignments" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "reassignReason" TEXT,
ADD COLUMN     "reassignedAt" TIMESTAMP(3),
ADD COLUMN     "reassignedById" TEXT,
ADD COLUMN     "reassignedFromId" TEXT,
ADD COLUMN     "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED';

-- CreateTable
CREATE TABLE "reviewer_capacities" (
    "id" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "maxConcurrentAssignments" INTEGER NOT NULL DEFAULT 10,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "unavailableReason" TEXT,
    "unavailableUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviewer_capacities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_conflicts_of_interest" (
    "id" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "ConflictSource" NOT NULL,
    "declaredById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_conflicts_of_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_escalations" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "firstReviewId" TEXT NOT NULL,
    "secondReviewId" TEXT NOT NULL,
    "scoreDifference" DECIMAL(6,2) NOT NULL,
    "thresholdApplied" DECIMAL(6,2) NOT NULL,
    "thirdReviewAssignmentId" TEXT,
    "resolvedFinalScore" DECIMAL(6,2),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_capacities_reviewerId_programmeId_key" ON "reviewer_capacities"("reviewerId", "programmeId");

-- CreateIndex
CREATE INDEX "review_conflicts_of_interest_applicationId_idx" ON "review_conflicts_of_interest"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "review_conflicts_of_interest_reviewerId_applicationId_key" ON "review_conflicts_of_interest"("reviewerId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "review_escalations_thirdReviewAssignmentId_key" ON "review_escalations"("thirdReviewAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "review_escalations_applicationId_firstReviewId_secondReview_key" ON "review_escalations"("applicationId", "firstReviewId", "secondReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "review_assignments_reassignedFromId_key" ON "review_assignments"("reassignedFromId");

-- CreateIndex
CREATE INDEX "review_assignments_applicationId_slot_idx" ON "review_assignments"("applicationId", "slot");

-- CreateIndex (hand-written, not expressible in schema.prisma's declarative
-- @@unique — a partial index, same category of exception as the pg_trgm
-- indexes documented in docs/database.md §5): at most one *active*
-- assignment per (applicationId, slot); REASSIGNED/CANCELLED rows are
-- historical and excluded, so reassignment can create a new row for the
-- same slot without violating uniqueness.
CREATE UNIQUE INDEX "review_assignments_applicationId_slot_active_key" ON "review_assignments"("applicationId", "slot") WHERE "status" NOT IN ('REASSIGNED', 'CANCELLED');

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_reassignedFromId_fkey" FOREIGN KEY ("reassignedFromId") REFERENCES "review_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_reassignedById_fkey" FOREIGN KEY ("reassignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_capacities" ADD CONSTRAINT "reviewer_capacities_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_capacities" ADD CONSTRAINT "reviewer_capacities_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_conflicts_of_interest" ADD CONSTRAINT "review_conflicts_of_interest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_conflicts_of_interest" ADD CONSTRAINT "review_conflicts_of_interest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_conflicts_of_interest" ADD CONSTRAINT "review_conflicts_of_interest_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_escalations" ADD CONSTRAINT "review_escalations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_escalations" ADD CONSTRAINT "review_escalations_firstReviewId_fkey" FOREIGN KEY ("firstReviewId") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_escalations" ADD CONSTRAINT "review_escalations_secondReviewId_fkey" FOREIGN KEY ("secondReviewId") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_escalations" ADD CONSTRAINT "review_escalations_thirdReviewAssignmentId_fkey" FOREIGN KEY ("thirdReviewAssignmentId") REFERENCES "review_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
