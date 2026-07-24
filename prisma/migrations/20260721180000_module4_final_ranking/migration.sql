-- CreateEnum
CREATE TYPE "TieResolutionStatus" AS ENUM ('PENDING', 'RESOLVED');

-- AlterTable
ALTER TABLE "ranking_snapshots" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "reopenReason" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedById" TEXT;

-- CreateTable
CREATE TABLE "ranking_tie_resolutions" (
    "id" TEXT NOT NULL,
    "rankingSnapshotId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "status" "TieResolutionStatus" NOT NULL DEFAULT 'PENDING',
    "justification" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_tie_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_tie_resolution_applications" (
    "id" TEXT NOT NULL,
    "rankingTieResolutionId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "resolvedRank" INTEGER,

    CONSTRAINT "ranking_tie_resolution_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ranking_tie_resolutions_cohortId_status_idx" ON "ranking_tie_resolutions"("cohortId", "status");

-- CreateIndex
CREATE INDEX "ranking_tie_resolutions_rankingSnapshotId_idx" ON "ranking_tie_resolutions"("rankingSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_tie_resolution_applications_rankingTieResolutionId__key" ON "ranking_tie_resolution_applications"("rankingTieResolutionId", "applicationId");

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_tie_resolutions" ADD CONSTRAINT "ranking_tie_resolutions_rankingSnapshotId_fkey" FOREIGN KEY ("rankingSnapshotId") REFERENCES "ranking_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_tie_resolutions" ADD CONSTRAINT "ranking_tie_resolutions_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_tie_resolutions" ADD CONSTRAINT "ranking_tie_resolutions_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_tie_resolution_applications" ADD CONSTRAINT "ranking_tie_resolution_applications_rankingTieResolutionId_fkey" FOREIGN KEY ("rankingTieResolutionId") REFERENCES "ranking_tie_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_tie_resolution_applications" ADD CONSTRAINT "ranking_tie_resolution_applications_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
