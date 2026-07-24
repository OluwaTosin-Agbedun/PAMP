import type { PrismaClient } from "@/lib/generated/prisma/client";

import { ALL_NOTIFICATION_EVENTS, type NotificationEventKey } from "../eventCatalogue";

/**
 * Default, editable-later copy for every catalogued event — the
 * Configuration Centre's template editor (§5.4) is exactly where a
 * Secretariat replaces any of this with approved programme wording.
 * Events without hand-written copy below fall back to a plain, factual
 * generic template built from the event's own label, so every event has
 * *something* sendable from day one rather than blocking on copy that
 * doesn't exist yet.
 */
const HAND_WRITTEN: Partial<Record<NotificationEventKey, { subject: string; body: string }>> = {
  APPLICATION_SUBMITTED: {
    subject: "Your PAM-P application has been received",
    body: "Dear {{applicantFirstName}},\n\nThank you for applying to the {{programmeName}} — {{cohortYear}} Cohort. Your application has been received and will now go through eligibility screening.\n\nWe will contact you if any further information is required.\n\nThe PAM-P Secretariat",
  },
  ELIGIBILITY_CLARIFICATION_REQUIRED: {
    subject: "Action needed: clarification required on your PAM-P application",
    body: "Dear {{applicantFirstName}},\n\nBefore your application can proceed, we need some clarification:\n\n{{clarificationReason}}\n\nPlease respond as soon as possible so your application isn't delayed.\n\nThe PAM-P Secretariat",
  },
  ELIGIBILITY_CLARIFICATION_RESOLVED: {
    subject: "Thank you — your response has been received",
    body: "Dear {{applicantFirstName}},\n\nThank you for the additional information. Your application is now back under review.\n\nThe PAM-P Secretariat",
  },
  ELIGIBLE: {
    subject: "You are eligible for PAM-P",
    body: "Dear {{applicantFirstName}},\n\nGood news — your application has passed eligibility screening and will now proceed to Application Review.\n\nThe PAM-P Secretariat",
  },
  INELIGIBLE: {
    subject: "Update on your PAM-P application",
    body: "Dear {{applicantFirstName}},\n\nAfter careful review, your application does not meet the eligibility requirements for this cohort. If you have questions, please contact the Programme Secretariat.\n\nWe thank you for your interest in PAM-P.\n\nThe PAM-P Secretariat",
  },
  DISQUALIFIED: {
    subject: "Update on your PAM-P application",
    body: "Dear {{applicantFirstName}},\n\nAfter review, your application has not been approved to continue in the selection process.\n\nThe PAM-P Secretariat",
  },
  SHORTLISTED: {
    subject: "You have been shortlisted for interview — PAM-P",
    body: "Dear {{applicantFirstName}},\n\nCongratulations — your application has been shortlisted. You will receive a separate interview invitation shortly.\n\nThe PAM-P Secretariat",
  },
  RESERVE: {
    subject: "Update on your PAM-P application",
    body: "Dear {{applicantFirstName}},\n\nYour application has been placed on the reserve list at this stage. We will contact you if a place becomes available.\n\nThe PAM-P Secretariat",
  },
  NOT_SHORTLISTED: {
    subject: "Update on your PAM-P application",
    body: "Dear {{applicantFirstName}},\n\nAfter review, your application has not been shortlisted for interview this cohort. We thank you for your interest in PAM-P.\n\nThe PAM-P Secretariat",
  },
  INTERVIEW_INVITATION: {
    subject: "PAM-P interview invitation",
    body: "Dear {{applicantFirstName}},\n\nYou are invited to a Selection Panel interview on {{interviewDate}} at {{interviewStartTime}} ({{interviewTimezone}}).\n\nJoin link: {{joinLink}}\n\nPlease join at least 10 minutes early. Full interview instructions will follow.\n\nThe PAM-P Secretariat",
  },
  INTERVIEW_REMINDER: {
    subject: "Reminder: your PAM-P interview is coming up",
    body: "Dear {{applicantFirstName}},\n\nThis is a reminder that your interview is in {{hoursBefore}} hours, on {{interviewDate}} at {{interviewStartTime}} ({{interviewTimezone}}).\n\nJoin link: {{joinLink}}\n\nThe PAM-P Secretariat",
  },
  INTERVIEW_RESCHEDULED: {
    subject: "Your PAM-P interview has been rescheduled",
    body: "Dear {{applicantFirstName}},\n\nYour interview has been rescheduled to {{interviewDate}} at {{interviewStartTime}} ({{interviewTimezone}}).\n\nReason: {{rescheduleReason}}\n\nThe PAM-P Secretariat",
  },
  INTERVIEW_CANCELLED: {
    subject: "Your PAM-P interview has been cancelled",
    body: "Dear {{applicantFirstName}},\n\nYour scheduled interview has been cancelled.\n\n{{cancellationReason}}\n\nWe will be in touch with next steps.\n\nThe PAM-P Secretariat",
  },
  SELECTED: {
    subject: "Congratulations — you have been selected for PAM-P",
    body: "Dear {{applicantFirstName}},\n\nCongratulations — you have been selected as a Fellow for the PAM-P cohort. A formal offer letter will follow separately.\n\nThe PAM-P Secretariat",
  },
  FINAL_RESERVE_LIST: {
    subject: "Update on your PAM-P application",
    body: "Dear {{applicantFirstName}},\n\nYou have been placed on the final reserve list. We will contact you promptly if a place becomes available.\n\nThe PAM-P Secretariat",
  },
  NOT_SELECTED: {
    subject: "Update on your PAM-P application",
    body: "Dear {{applicantFirstName}},\n\nAfter a highly competitive selection process, we are unable to offer you a place in this cohort. We thank you sincerely for your interest in PAM-P and encourage you to apply again in future.\n\nThe PAM-P Secretariat",
  },
  OFFER_ISSUED: {
    subject: "Your PAM-P offer letter",
    body: "Dear {{applicantFirstName}},\n\nWe are pleased to formally offer you a place in the PAM-P cohort.\n\n{{offerInstructions}}\n\nPlease confirm your acceptance by {{offerDeadline}}.\n\nThe PAM-P Secretariat",
  },
  ACCEPTANCE_RECEIVED: {
    subject: "Your PAM-P acceptance has been received",
    body: "Dear {{applicantFirstName}},\n\nThank you — we have received your acceptance. Onboarding details will follow.\n\nThe PAM-P Secretariat",
  },
  OFFER_DECLINED: {
    subject: "We're sorry to see you decline your PAM-P offer",
    body: "Dear {{applicantFirstName}},\n\nWe have recorded that you have declined your offer. We wish you well and hope you'll consider PAM-P again in future.\n\nThe PAM-P Secretariat",
  },
  OFFER_LAPSED: {
    subject: "Your PAM-P offer has lapsed",
    body: "Dear {{applicantFirstName}},\n\nAs we did not receive your acceptance within the offer window, your place has now been offered to another candidate.\n\nThe PAM-P Secretariat",
  },
  ONBOARDING: {
    subject: "Welcome to PAM-P — onboarding details",
    body: "Dear {{applicantFirstName}},\n\nOnboarding will take place on {{onboardingDate}}. Further details will follow.\n\nThe PAM-P Secretariat",
  },
  PROGRAMME_COMMENCEMENT: {
    subject: "PAM-P begins soon",
    body: "Dear {{applicantFirstName}},\n\nThe programme begins on {{startDate}}. We look forward to welcoming you.\n\nThe PAM-P Secretariat",
  },
  GRADUATION: {
    subject: "Congratulations, PAM-P Graduate",
    body: "Dear {{applicantFirstName}},\n\nCongratulations on completing the PAM-P programme. Details of your graduation will follow.\n\nThe PAM-P Secretariat",
  },
  ALUMNI_ACTIVATION: {
    subject: "Welcome to the PAM-P Alumni Network",
    body: "Dear {{applicantFirstName}},\n\nWelcome to the PAM-P Alumni Network. We look forward to staying connected.\n\nThe PAM-P Secretariat",
  },
};

function genericTemplate(event: (typeof ALL_NOTIFICATION_EVENTS)[number]) {
  const greeting = event.recipient === "APPLICANT" ? "Dear {{applicantFirstName}}," : "Team,";
  return {
    subject: `PAM-P: ${event.label}`,
    body: `${greeting}\n\nThis is a notification regarding: ${event.label}.\n\nThe PAM-P Secretariat`,
  };
}

export async function seedNotificationTemplates(prisma: PrismaClient, adminId: string): Promise<{ created: number; alreadyExisted: number }> {
  let created = 0;
  let alreadyExisted = 0;

  for (const event of ALL_NOTIFICATION_EVENTS) {
    const existing = await prisma.notificationTemplate.findFirst({ where: { event: event.key, isActive: true } });
    if (existing) {
      alreadyExisted++;
      continue;
    }
    const copy = HAND_WRITTEN[event.key as NotificationEventKey] ?? genericTemplate(event);
    await prisma.notificationTemplate.create({
      data: {
        event: event.key,
        version: 1,
        subject: copy.subject,
        body: copy.body,
        isActive: true,
        updatedById: adminId,
      },
    });
    created++;
  }

  return { created, alreadyExisted };
}
