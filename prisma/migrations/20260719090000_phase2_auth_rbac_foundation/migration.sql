-- Phase 2: application foundation, authentication, RBAC.
--
-- Hand-written (not `prisma migrate dev`-generated verbatim) for two
-- reasons documented in docs/database.md's migration-plan pattern:
--
-- 1. Replacing `users.isActive` (boolean) with `users.status`
--    (AccountStatus enum) needs a value-preserving backfill, not the
--    default-value behavior Postgres would apply to a plain
--    ADD COLUMN ... NOT NULL DEFAULT 'ACTIVE'. Verified against real
--    data before writing this: one seeded test user has
--    isActive = false — a naive migration would have silently
--    reactivated her account.
-- 2. The raw `prisma migrate diff` output also proposed dropping the
--    pg_trgm search indexes from the previous hand-written migration,
--    because they aren't declarable in schema.prisma and so aren't
--    visible to Prisma's diff engine. Removed from this file — those
--    indexes stay.

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION', 'LOCKED');

-- AlterTable: add status nullable first, backfill from isActive, then lock down
ALTER TABLE "users" ADD COLUMN "status" "AccountStatus";

UPDATE "users"
SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"AccountStatus" ELSE 'INACTIVE'::"AccountStatus" END;

ALTER TABLE "users" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "users" DROP COLUMN "isActive";

-- AlterTable: password-change-required flag
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: audit trail — correlation ID + denormalized programme/cohort scoping
ALTER TABLE "audit_logs" ADD COLUMN "cohortId" TEXT,
ADD COLUMN "correlationId" TEXT,
ADD COLUMN "programmeId" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

-- CreateIndex
CREATE INDEX "audit_logs_programmeId_idx" ON "audit_logs"("programmeId");

-- CreateIndex
CREATE INDEX "audit_logs_cohortId_idx" ON "audit_logs"("cohortId");
