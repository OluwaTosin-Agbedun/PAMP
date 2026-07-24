
-- CreateEnum
CREATE TYPE "RankingApprovalStageType" AS ENUM ('TOP_70', 'TOP_60', 'FINAL_SELECTION', 'VERIFICATION_CONFIRMATION');

-- CreateEnum
CREATE TYPE "RankingApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ranking_approval_stages" (
    "id" TEXT NOT NULL,
    "rankingSnapshotId" TEXT NOT NULL,
    "stage" "RankingApprovalStageType" NOT NULL,
    "decision" "RankingApprovalDecision" NOT NULL,
    "approverId" TEXT NOT NULL,
    "comment" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_approval_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ranking_approval_stages_rankingSnapshotId_createdAt_idx" ON "ranking_approval_stages"("rankingSnapshotId", "createdAt");

-- AddForeignKey
ALTER TABLE "ranking_approval_stages" ADD CONSTRAINT "ranking_approval_stages_rankingSnapshotId_fkey" FOREIGN KEY ("rankingSnapshotId") REFERENCES "ranking_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_approval_stages" ADD CONSTRAINT "ranking_approval_stages_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

