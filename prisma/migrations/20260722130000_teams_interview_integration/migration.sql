-- CreateEnum
CREATE TYPE "TeamsMeetingSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- CreateTable
CREATE TABLE "interview_teams_meetings" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "graphEventId" TEXT,
    "joinUrl" TEXT,
    "organiserUpn" TEXT,
    "syncStatus" "TeamsMeetingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "lastAttemptedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_teams_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_teams_meetings_interviewId_key" ON "interview_teams_meetings"("interviewId");

-- CreateIndex
CREATE INDEX "interview_teams_meetings_syncStatus_idx" ON "interview_teams_meetings"("syncStatus");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_teams_meetings" ADD CONSTRAINT "interview_teams_meetings_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_teams_meetings" ADD CONSTRAINT "interview_teams_meetings_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_teams_meetings" ADD CONSTRAINT "interview_teams_meetings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
