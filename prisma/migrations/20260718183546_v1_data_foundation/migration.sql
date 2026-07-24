/*
  Warnings:

  - Added the required column `programmeId` to the `cohorts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ScoreSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RECUSED');

-- CreateEnum
CREATE TYPE "RankingTier" AS ENUM ('TOP_70', 'TOP_60', 'RESERVE', 'NOT_RANKED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SelectionOutcome" AS ENUM ('SELECTED', 'RESERVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExecutiveDecision" AS ENUM ('APPROVED', 'RETURNED', 'CLARIFICATION_REQUESTED');

-- CreateEnum
CREATE TYPE "AdmissionOfferStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('REVIEWER', 'INTERVIEWER', 'COMMITTEE', 'EXECUTIVE', 'ALL_STAFF');

-- AlterTable
ALTER TABLE "applicants" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "userAgent" TEXT;

-- AlterTable (nullable first — backfilled below once "programmes" exists, then locked to NOT NULL)
ALTER TABLE "cohorts" ADD COLUMN     "programmeId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "programmes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- Backfill: seed a default programme and attach every existing cohort to
-- it, so the NOT NULL constraint below doesn't fail against pre-existing
-- rows. Safe to run on a database with zero cohorts too (no-op UPDATE).
-- "programmes" is created fresh in this same migration, so a plain INSERT
-- is correct here — this statement runs at most once per database.
INSERT INTO "programmes" ("id", "name", "slug", "isActive", "createdAt", "updatedAt")
VALUES ('pgm_pamp_default', 'Pius Anyim Mentorship Programme', 'pam-p', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "cohorts"
SET "programmeId" = (SELECT "id" FROM "programmes" WHERE "slug" = 'pam-p')
WHERE "programmeId" IS NULL;

ALTER TABLE "cohorts" ALTER COLUMN "programmeId" SET NOT NULL;

-- CreateTable
CREATE TABLE "review_criteria" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" DECIMAL(6,2) NOT NULL,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "reviewAssignmentId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ScoreSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "totalScore" DECIMAL(6,2),
    "comments" TEXT,
    "conflictOfInterest" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_scores" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "comment" TEXT,

    CONSTRAINT "review_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_scores" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "reviewAverage" DECIMAL(6,2),
    "reviewScoreCount" INTEGER NOT NULL DEFAULT 0,
    "interviewAverage" DECIMAL(6,2),
    "interviewScoreCount" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" DECIMAL(6,2),
    "rank" INTEGER,
    "rankingTier" "RankingTier" NOT NULL DEFAULT 'NOT_RANKED',
    "isRankLocked" BOOLEAN NOT NULL DEFAULT false,
    "lastComputedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_snapshots" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetSize" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_snapshot_entries" (
    "id" TEXT NOT NULL,
    "rankingSnapshotId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "ranking_snapshot_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_criteria" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" DECIMAL(6,2) NOT NULL,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "meetingLink" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_panelists" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isChair" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "interview_panelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_scores" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "panelistId" TEXT NOT NULL,
    "status" "ScoreSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "totalScore" DECIMAL(6,2),
    "comments" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_score_entries" (
    "id" TEXT NOT NULL,
    "interviewScoreId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "interview_score_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_votes" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "committeeMemberId" TEXT NOT NULL,
    "recommendation" "SelectionOutcome" NOT NULL,
    "proposedRank" INTEGER,
    "comments" TEXT,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_decisions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "decision" "SelectionOutcome" NOT NULL,
    "finalRank" INTEGER,
    "rationale" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_approvals" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "decision" "ExecutiveDecision" NOT NULL,
    "notes" TEXT,
    "approverId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_offers" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "AdmissionOfferStatus" NOT NULL DEFAULT 'PENDING',
    "onboardingChecklist" JSONB,
    "issuedById" TEXT NOT NULL,
    "offerSentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'ALL_STAFF',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programmes_slug_key" ON "programmes"("slug");

-- CreateIndex
CREATE INDEX "review_criteria_cohortId_isActive_idx" ON "review_criteria"("cohortId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_reviewAssignmentId_key" ON "reviews"("reviewAssignmentId");

-- CreateIndex
CREATE INDEX "reviews_applicationId_idx" ON "reviews"("applicationId");

-- CreateIndex
CREATE INDEX "reviews_reviewerId_status_idx" ON "reviews"("reviewerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_scores_reviewId_criterionId_key" ON "review_scores"("reviewId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "application_scores_applicationId_key" ON "application_scores"("applicationId");

-- CreateIndex
CREATE INDEX "application_scores_cohortId_rank_idx" ON "application_scores"("cohortId", "rank");

-- CreateIndex
CREATE INDEX "application_scores_cohortId_compositeScore_idx" ON "application_scores"("cohortId", "compositeScore");

-- CreateIndex
CREATE INDEX "ranking_snapshots_cohortId_generatedAt_idx" ON "ranking_snapshots"("cohortId", "generatedAt");

-- CreateIndex
CREATE INDEX "ranking_snapshot_entries_rankingSnapshotId_rank_idx" ON "ranking_snapshot_entries"("rankingSnapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_snapshot_entries_rankingSnapshotId_applicationId_key" ON "ranking_snapshot_entries"("rankingSnapshotId", "applicationId");

-- CreateIndex
CREATE INDEX "interview_criteria_cohortId_isActive_idx" ON "interview_criteria"("cohortId", "isActive");

-- CreateIndex
CREATE INDEX "interview_questions_cohortId_isActive_idx" ON "interview_questions"("cohortId", "isActive");

-- CreateIndex
CREATE INDEX "interviews_cohortId_scheduledAt_idx" ON "interviews"("cohortId", "scheduledAt");

-- CreateIndex
CREATE INDEX "interviews_applicationId_idx" ON "interviews"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_panelists_interviewId_userId_key" ON "interview_panelists"("interviewId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_scores_interviewId_panelistId_key" ON "interview_scores"("interviewId", "panelistId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_score_entries_interviewScoreId_criterionId_key" ON "interview_score_entries"("interviewScoreId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "committee_votes_applicationId_committeeMemberId_key" ON "committee_votes"("applicationId", "committeeMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "committee_decisions_applicationId_key" ON "committee_decisions"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "executive_approvals_applicationId_key" ON "executive_approvals"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "admission_offers_applicationId_key" ON "admission_offers"("applicationId");

-- CreateIndex
CREATE INDEX "notes_applicationId_createdAt_idx" ON "notes"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_authorId_idx" ON "notes"("authorId");

-- CreateIndex
CREATE INDEX "applications_cohortId_createdAt_idx" ON "applications"("cohortId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "cohorts_programmeId_idx" ON "cohorts"("programmeId");

-- CreateIndex
CREATE INDEX "import_batches_cohortId_createdAt_idx" ON "import_batches"("cohortId", "createdAt");

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_criteria" ADD CONSTRAINT "review_criteria_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewAssignmentId_fkey" FOREIGN KEY ("reviewAssignmentId") REFERENCES "review_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_scores" ADD CONSTRAINT "review_scores_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_scores" ADD CONSTRAINT "review_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "review_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_scores" ADD CONSTRAINT "application_scores_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_scores" ADD CONSTRAINT "application_scores_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshot_entries" ADD CONSTRAINT "ranking_snapshot_entries_rankingSnapshotId_fkey" FOREIGN KEY ("rankingSnapshotId") REFERENCES "ranking_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshot_entries" ADD CONSTRAINT "ranking_snapshot_entries_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_criteria" ADD CONSTRAINT "interview_criteria_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_scores" ADD CONSTRAINT "interview_scores_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_scores" ADD CONSTRAINT "interview_scores_panelistId_fkey" FOREIGN KEY ("panelistId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_score_entries" ADD CONSTRAINT "interview_score_entries_interviewScoreId_fkey" FOREIGN KEY ("interviewScoreId") REFERENCES "interview_scores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_score_entries" ADD CONSTRAINT "interview_score_entries_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "interview_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_votes" ADD CONSTRAINT "committee_votes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_votes" ADD CONSTRAINT "committee_votes_committeeMemberId_fkey" FOREIGN KEY ("committeeMemberId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_decisions" ADD CONSTRAINT "committee_decisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_decisions" ADD CONSTRAINT "committee_decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_approvals" ADD CONSTRAINT "executive_approvals_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_approvals" ADD CONSTRAINT "executive_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
