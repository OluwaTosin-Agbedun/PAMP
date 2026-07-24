-- Fixes surfaced by cross-referencing the repo against the PAM-P 2026
-- source documents (Application Review Guidelines and Scoring, Interview
-- Score Sheet, Selection Panel Notification Brief, Application Review
-- and Selection Metrics Framework, Interview Questions). Generated via
-- `prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script`, with the four recurring `DROP INDEX
-- applicants_*_trgm_idx` statements removed — a known false positive of
-- the diff tool against this database's manually-created pg_trgm GIN
-- indexes, not a real schema drift.
--
-- InterviewScore.recommendation was free String? (no closed option set
-- was ever specified before the Score Sheet document); confirmed no
-- existing row has a non-null value, so a plain drop-and-recreate as an
-- enum column is safe pre-production, no backfill needed.

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('VIRTUAL', 'PHYSICAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONGLY_RECOMMEND', 'RECOMMEND', 'RESERVE', 'NOT_RECOMMENDED', 'INTEGRITY_HOLD');

-- AlterTable
ALTER TABLE "interview_scores" ADD COLUMN     "integrityFlag" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "recommendation",
ADD COLUMN     "recommendation" "InterviewRecommendation";

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "mode" "InterviewMode";
