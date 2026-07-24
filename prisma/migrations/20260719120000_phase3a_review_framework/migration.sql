-- Phase 3A: review framework and scoring engine.
--
-- review_criteria, reviews, and review_scores are all empty at the time
-- of this migration (confirmed via direct query — the Reviewer Workspace
-- was never built, so nothing has ever written to them), so this is a
-- clean structural change, not a data migration: no backfill is needed
-- for the new NOT NULL columns (reviewFrameworkId on review_criteria and
-- reviews).
--
-- The four DROP INDEX statements Prisma's raw diff proposed for the
-- pg_trgm search indexes (applicants_*_trgm_idx) are deliberately
-- excluded below — those indexes were added by hand-written SQL in an
-- earlier migration and aren't visible to Prisma's schema-diff engine,
-- which otherwise doesn't see them and proposes dropping them. Same
-- false positive documented in the Phase 2 migration.

-- CreateEnum
CREATE TYPE "ReviewStageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ReviewFrameworkStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ReviewScoringMethod" AS ENUM ('WEIGHTED_SUM');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'REOPENED', 'RECUSED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "review_criteria" DROP CONSTRAINT "review_criteria_cohortId_fkey";

-- DropIndex
DROP INDEX "review_criteria_cohortId_isActive_idx";

-- AlterTable
ALTER TABLE "review_criteria" DROP COLUMN "cohortId",
DROP COLUMN "order",
ADD COLUMN     "allowDecimalScores" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "evidenceGuidance" TEXT,
ADD COLUMN     "isCommentMandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMandatory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minScore" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ratingScaleId" TEXT,
ADD COLUMN     "reviewFrameworkId" TEXT NOT NULL,
ADD COLUMN     "reviewerGuidance" TEXT;

-- AlterTable
ALTER TABLE "review_scores" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "reopenReason" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedById" TEXT,
ADD COLUMN     "reviewFrameworkId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateTable
CREATE TABLE "review_stages" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "cohortId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "maxTotalScore" DECIMAL(6,2) NOT NULL,
    "status" "ReviewStageStatus" NOT NULL DEFAULT 'DRAFT',
    "sequenceOrder" INTEGER NOT NULL DEFAULT 0,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "commentsRequired" BOOLEAN NOT NULL DEFAULT false,
    "allCriteriaMandatory" BOOLEAN NOT NULL DEFAULT true,
    "allowPartialDraft" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_frameworks" (
    "id" TEXT NOT NULL,
    "reviewStageId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "cohortId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "ReviewFrameworkStatus" NOT NULL DEFAULT 'DRAFT',
    "scoringMethod" "ReviewScoringMethod" NOT NULL DEFAULT 'WEIGHTED_SUM',
    "effectiveAt" TIMESTAMP(3),
    "totalConfiguredScore" DECIMAL(6,2),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_scales" (
    "id" TEXT NOT NULL,
    "reviewFrameworkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_scale_bands" (
    "id" TEXT NOT NULL,
    "ratingScaleId" TEXT NOT NULL,
    "value" DECIMAL(6,2) NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "behavioralAnchor" TEXT,
    "evidenceExpectation" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rating_scale_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_stages_programmeId_cohortId_idx" ON "review_stages"("programmeId", "cohortId");

-- CreateIndex
CREATE UNIQUE INDEX "review_stages_programmeId_cohortId_code_key" ON "review_stages"("programmeId", "cohortId", "code");

-- CreateIndex
CREATE INDEX "review_frameworks_reviewStageId_status_idx" ON "review_frameworks"("reviewStageId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_frameworks_reviewStageId_version_key" ON "review_frameworks"("reviewStageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "rating_scale_bands_ratingScaleId_value_key" ON "rating_scale_bands"("ratingScaleId", "value");

-- CreateIndex
CREATE INDEX "review_criteria_reviewFrameworkId_isActive_idx" ON "review_criteria"("reviewFrameworkId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "review_criteria_reviewFrameworkId_code_key" ON "review_criteria"("reviewFrameworkId", "code");

-- CreateIndex
CREATE INDEX "reviews_reviewerId_status_idx" ON "reviews"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "reviews_reviewFrameworkId_idx" ON "reviews"("reviewFrameworkId");

-- AddForeignKey
ALTER TABLE "review_stages" ADD CONSTRAINT "review_stages_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_stages" ADD CONSTRAINT "review_stages_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_frameworks" ADD CONSTRAINT "review_frameworks_reviewStageId_fkey" FOREIGN KEY ("reviewStageId") REFERENCES "review_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_frameworks" ADD CONSTRAINT "review_frameworks_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_frameworks" ADD CONSTRAINT "review_frameworks_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_scales" ADD CONSTRAINT "rating_scales_reviewFrameworkId_fkey" FOREIGN KEY ("reviewFrameworkId") REFERENCES "review_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_scale_bands" ADD CONSTRAINT "rating_scale_bands_ratingScaleId_fkey" FOREIGN KEY ("ratingScaleId") REFERENCES "rating_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_criteria" ADD CONSTRAINT "review_criteria_reviewFrameworkId_fkey" FOREIGN KEY ("reviewFrameworkId") REFERENCES "review_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_criteria" ADD CONSTRAINT "review_criteria_ratingScaleId_fkey" FOREIGN KEY ("ratingScaleId") REFERENCES "rating_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewFrameworkId_fkey" FOREIGN KEY ("reviewFrameworkId") REFERENCES "review_frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
