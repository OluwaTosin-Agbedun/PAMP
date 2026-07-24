-- Release 1.5: Configuration Centre schema — Programme.code, Cohort's
-- application intake window, the new ProgrammeWindow model (Eligibility
-- Review / Interview / Executive Approval / Offer windows), and
-- AuditLog.requestId/sessionId for Release 1.5's audit enhancement.
--
-- The four DROP INDEX statements Prisma's raw diff proposed for the
-- pg_trgm search indexes (applicants_*_trgm_idx) are deliberately
-- excluded below — same recurring false positive documented in every
-- migration since the Phase 2 one (those indexes are hand-written SQL,
-- invisible to Prisma's schema-diff engine).

-- CreateEnum
CREATE TYPE "ProgrammeWindowCode" AS ENUM ('ELIGIBILITY_REVIEW', 'INTERVIEW', 'EXECUTIVE_APPROVAL', 'OFFER');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "cohorts" ADD COLUMN     "applicationClosesAt" TIMESTAMP(3),
ADD COLUMN     "applicationOpensAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "programmes" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "programme_windows" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "cohortId" TEXT,
    "code" "ProgrammeWindowCode" NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programme_windows_programmeId_idx" ON "programme_windows"("programmeId");

-- CreateIndex
CREATE INDEX "programme_windows_cohortId_idx" ON "programme_windows"("cohortId");

-- CreateIndex
CREATE UNIQUE INDEX "programme_windows_programmeId_cohortId_code_key" ON "programme_windows"("programmeId", "cohortId", "code");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- AddForeignKey
ALTER TABLE "programme_windows" ADD CONSTRAINT "programme_windows_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_windows" ADD CONSTRAINT "programme_windows_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
