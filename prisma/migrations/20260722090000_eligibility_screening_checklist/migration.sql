-- CreateEnum
CREATE TYPE "NyscStatus" AS ENUM ('NOT_RECORDED', 'COMPLETED', 'CURRENTLY_SERVING', 'EXEMPTED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('PENDING_SCREENING', 'IN_PROGRESS', 'CLARIFICATION_REQUIRED', 'ESCALATED', 'ELIGIBLE', 'INELIGIBLE', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "ScreeningNextAction" AS ENUM ('PROCEED', 'CLARIFY', 'REJECT', 'ESCALATE');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PASS', 'FAIL', 'CLARIFY', 'CLEAR', 'FLAG');

-- CreateEnum
CREATE TYPE "ChecklistSection" AS ENUM ('DOCUMENT', 'BASELINE', 'INTEGRITY');

-- AlterEnum
ALTER TYPE "EligibilityStatus" ADD VALUE 'CLARIFICATION_REQUIRED';
ALTER TYPE "EligibilityStatus" ADD VALUE 'DISQUALIFIED';

-- AlterTable
ALTER TABLE "applicants" ADD COLUMN     "governmentIdNumber" TEXT,
ADD COLUMN     "governmentIdType" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "nyscCompletionDate" TIMESTAMP(3),
ADD COLUMN     "nyscStatus" "NyscStatus" NOT NULL DEFAULT 'NOT_RECORDED';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "availabilityDeclared" BOOLEAN,
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "duplicateResolutionNote" TEXT,
ADD COLUMN     "duplicateResolvedAt" TIMESTAMP(3),
ADD COLUMN     "duplicateResolvedById" TEXT,
ADD COLUMN     "isWithdrawn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnById" TEXT,
ADD COLUMN     "withdrawnReason" TEXT;

-- CreateTable
CREATE TABLE "eligibility_screenings" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "ScreeningStatus" NOT NULL DEFAULT 'PENDING_SCREENING',
    "screenerId" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "dateReviewed" TIMESTAMP(3),
    "nextAction" "ScreeningNextAction",
    "reasonForDecision" TEXT,
    "outstandingClarification" TEXT,
    "integrityNote" TEXT,
    "secondReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "secondReviewerId" TEXT,
    "secondReviewCompletedAt" TIMESTAMP(3),
    "secondReviewNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eligibility_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_checklist_items" (
    "id" TEXT NOT NULL,
    "screeningId" TEXT NOT NULL,
    "section" "ChecklistSection" NOT NULL,
    "itemKey" TEXT NOT NULL,
    "status" "ChecklistItemStatus",
    "comment" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eligibility_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eligibility_screenings_applicationId_key" ON "eligibility_screenings"("applicationId");

-- CreateIndex
CREATE INDEX "eligibility_screenings_status_idx" ON "eligibility_screenings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "eligibility_checklist_items_screeningId_section_itemKey_key" ON "eligibility_checklist_items"("screeningId", "section", "itemKey");

-- CreateIndex
CREATE INDEX "applications_duplicateOfId_idx" ON "applications"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_duplicateResolvedById_fkey" FOREIGN KEY ("duplicateResolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_screenings" ADD CONSTRAINT "eligibility_screenings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_screenings" ADD CONSTRAINT "eligibility_screenings_screenerId_fkey" FOREIGN KEY ("screenerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_screenings" ADD CONSTRAINT "eligibility_screenings_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_screenings" ADD CONSTRAINT "eligibility_screenings_secondReviewerId_fkey" FOREIGN KEY ("secondReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_screenings" ADD CONSTRAINT "eligibility_screenings_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_screenings" ADD CONSTRAINT "eligibility_screenings_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_checklist_items" ADD CONSTRAINT "eligibility_checklist_items_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "eligibility_screenings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_checklist_items" ADD CONSTRAINT "eligibility_checklist_items_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
