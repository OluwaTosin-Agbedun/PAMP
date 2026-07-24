-- Release 1.5: the Eligibility Reviewer QA governance model —
-- EligibilityRecommendation, the one write path the role gains (flag +
-- recommend; never mutates Application.eligibilityStatus itself).
--
-- The four DROP INDEX statements Prisma's raw diff proposed for the
-- pg_trgm search indexes (applicants_*_trgm_idx) are deliberately
-- excluded below — same recurring false positive documented in every
-- migration since the Phase 2 one.

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'EXECUTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "eligibility_recommendations" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "currentIsEligible" BOOLEAN NOT NULL,
    "recommendedIsEligible" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eligibility_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eligibility_recommendations_applicationId_idx" ON "eligibility_recommendations"("applicationId");

-- CreateIndex
CREATE INDEX "eligibility_recommendations_status_idx" ON "eligibility_recommendations"("status");

-- AddForeignKey
ALTER TABLE "eligibility_recommendations" ADD CONSTRAINT "eligibility_recommendations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_recommendations" ADD CONSTRAINT "eligibility_recommendations_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_recommendations" ADD CONSTRAINT "eligibility_recommendations_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
