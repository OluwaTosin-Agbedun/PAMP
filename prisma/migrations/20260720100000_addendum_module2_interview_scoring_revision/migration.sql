-- Addendum Module 2 — Interview Scoring Revision (Enterprise Functional
-- Specification Addendum §2.3, §2.6). Generated via `prisma migrate diff
-- --from-config-datasource --to-schema prisma/schema.prisma --script`,
-- with the four recurring `DROP INDEX applicants_*_trgm_idx` statements
-- removed — a known false positive of the diff tool against this
-- database's manually-created pg_trgm GIN indexes (present in every
-- migration since Sequence 1), not a real schema drift.
--
-- InterviewScore.comments (single freeform field) is replaced by four
-- structured fields per §2.3. Pre-production data only — no backfill
-- needed for the dropped column (see ADR-0018).

-- AlterTable
ALTER TABLE "interview_scores" DROP COLUMN "comments",
ADD COLUMN     "concerns" TEXT,
ADD COLUMN     "overallAssessment" TEXT,
ADD COLUMN     "recommendation" TEXT,
ADD COLUMN     "strengths" TEXT;

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "scoringOverrideAt" TIMESTAMP(3),
ADD COLUMN     "scoringOverrideById" TEXT,
ADD COLUMN     "scoringOverrideMissingPanelistId" TEXT,
ADD COLUMN     "scoringOverrideReason" TEXT;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_scoringOverrideById_fkey" FOREIGN KEY ("scoringOverrideById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_scoringOverrideMissingPanelistId_fkey" FOREIGN KEY ("scoringOverrideMissingPanelistId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
