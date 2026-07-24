-- CreateEnum
CREATE TYPE "NotificationRecipientType" AS ENUM ('APPLICANT', 'USER');

-- CreateEnum
CREATE TYPE "OutboundNotificationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_notifications" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "recipientType" "NotificationRecipientType" NOT NULL,
    "applicantId" TEXT,
    "userId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "internalComment" TEXT,
    "applicantFacingComment" TEXT,
    "status" "OutboundNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "correlationId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_templates_event_isActive_idx" ON "notification_templates"("event", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_event_version_key" ON "notification_templates"("event", "version");

-- CreateIndex
CREATE INDEX "outbound_notifications_status_scheduledFor_idx" ON "outbound_notifications"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "outbound_notifications_event_idx" ON "outbound_notifications"("event");

-- CreateIndex
CREATE INDEX "outbound_notifications_applicantId_idx" ON "outbound_notifications"("applicantId");

-- CreateIndex
CREATE INDEX "outbound_notifications_userId_idx" ON "outbound_notifications"("userId");

-- CreateIndex
CREATE INDEX "outbound_notifications_relatedEntityType_relatedEntityId_idx" ON "outbound_notifications"("relatedEntityType", "relatedEntityId");

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_notifications" ADD CONSTRAINT "outbound_notifications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_notifications" ADD CONSTRAINT "outbound_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_notifications" ADD CONSTRAINT "outbound_notifications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_notifications" ADD CONSTRAINT "outbound_notifications_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_notifications" ADD CONSTRAINT "outbound_notifications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

