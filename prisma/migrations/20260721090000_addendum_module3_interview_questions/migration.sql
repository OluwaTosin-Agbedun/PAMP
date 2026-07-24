-- Addendum Module 3 — Interview Questions (Enterprise Functional
-- Specification Addendum §3). Generated via `prisma migrate diff
-- --from-config-datasource --to-schema prisma/schema.prisma --script`,
-- with the four recurring `DROP INDEX applicants_*_trgm_idx` statements
-- removed — a known false positive of the diff tool against this
-- database's manually-created pg_trgm GIN indexes (present in every
-- migration since Sequence 1), not a real schema drift. The
-- `interview_questions_cohortId_isActive_idx` drop below IS real (it's
-- superseded by the new cohortId_category_isActive index).
--
-- InterviewQuestion is confirmed empty in every environment (no seed
-- data, no admin UI existed before this module) — the NOT NULL
-- `category` column has no backfill concern.

-- CreateEnum
CREATE TYPE "InterviewQuestionCategory" AS ENUM ('MANDATORY', 'PATHWAY', 'ADDITIONAL_BANK');

-- CreateEnum
CREATE TYPE "InterviewPathway" AS ENUM ('ENTREPRENEURSHIP_ENTERPRISE', 'PUBLIC_PRIVATE_SECTOR_LEADERSHIP', 'ACADEMIA_ADVANCED_STUDIES');

-- DropIndex
DROP INDEX "interview_questions_cohortId_isActive_idx";

-- AlterTable
ALTER TABLE "interview_questions" ADD COLUMN     "category" "InterviewQuestionCategory" NOT NULL,
ADD COLUMN     "pathway" "InterviewPathway";

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "actualEndedAt" TIMESTAMP(3),
ADD COLUMN     "actualEndedById" TEXT,
ADD COLUMN     "actualStartedAt" TIMESTAMP(3),
ADD COLUMN     "actualStartedById" TEXT;

-- CreateTable
CREATE TABLE "interview_questions_asked" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "askedByPanelistId" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_questions_asked_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_questions_asked_interviewId_questionId_key" ON "interview_questions_asked"("interviewId", "questionId");

-- CreateIndex
CREATE INDEX "interview_questions_cohortId_category_isActive_idx" ON "interview_questions"("cohortId", "category", "isActive");

-- AddForeignKey
ALTER TABLE "interview_questions_asked" ADD CONSTRAINT "interview_questions_asked_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions_asked" ADD CONSTRAINT "interview_questions_asked_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions_asked" ADD CONSTRAINT "interview_questions_asked_askedByPanelistId_fkey" FOREIGN KEY ("askedByPanelistId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_actualStartedById_fkey" FOREIGN KEY ("actualStartedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_actualEndedById_fkey" FOREIGN KEY ("actualEndedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
