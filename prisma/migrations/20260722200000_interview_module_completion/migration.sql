-- CreateEnum
CREATE TYPE "InterviewAttendanceStatus" AS ENUM ('SCHEDULED', 'PRESENT', 'LATE', 'ABSENT', 'TECHNICAL_ISSUE', 'RESCHEDULED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "InterviewQuestionCategory" ADD VALUE 'SITUATIONAL';

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "attendanceNote" TEXT,
ADD COLUMN     "attendanceRecordedAt" TIMESTAMP(3),
ADD COLUMN     "attendanceRecordedById" TEXT,
ADD COLUMN     "attendanceStatus" "InterviewAttendanceStatus" NOT NULL DEFAULT 'SCHEDULED';

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_attendanceRecordedById_fkey" FOREIGN KEY ("attendanceRecordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

