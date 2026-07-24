-- The 4 "DropIndex" statements Prisma auto-generated here for
-- applicants_{email,firstName,institution,lastName}_trgm_idx were a
-- false positive: those GIN/trigram indexes are hand-written in
-- 20260718184500_search_indexes (not expressible via schema.prisma's
-- declarative @@index), so migrate dev's diff against the schema always
-- sees them as unmanaged drift. Stripped rather than applied — see
-- ADR/commit history for this migration.

-- AlterTable
ALTER TABLE "eligibility_screenings" ADD COLUMN     "clarificationDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "clarificationDeadlineExtendedAt" TIMESTAMP(3),
ADD COLUMN     "clarificationDeadlineExtendedById" TEXT,
ADD COLUMN     "clarificationDeadlineExtensionReason" TEXT;

-- AddForeignKey
ALTER TABLE "eligibility_screenings" ADD CONSTRAINT "eligibility_screenings_clarificationDeadlineExtendedById_fkey" FOREIGN KEY ("clarificationDeadlineExtendedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
