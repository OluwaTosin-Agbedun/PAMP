import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { requirePermission } from "@/lib/permissions/service";
import { SETTINGS_KEYS, getBooleanSettingValue, getNumericSettingValue } from "@/lib/settings/service";
import { enqueueNotification } from "@/modules/notifications/services/notificationService";
import { autoAssignReviewers } from "@/modules/reviews/services/assignmentService";
import type { NotificationEventKey } from "@/modules/notifications/eventCatalogue";

import { ALL_CHECKLIST_ITEMS } from "./checklistDefinition";
import { canMarkEligible, type ChecklistItemRecord } from "./checklistValidation";
import { evaluateBaselineItem, evaluateDocumentItem, evaluateIntegrityItem, type PreCheckContext } from "./automaticPreChecks";
import { decideAutomaticEligibility } from "./automaticDecision";
import { findExactDuplicates } from "./duplicateDetection";
import { autoAssignRandomReviewer } from "./reviewerAssignment";
import * as repo from "./screeningRepository";
import type {
  AssignScreenerInput,
  EscalateInput,
  ExtendClarificationDeadlineInput,
  MarkDisqualifiedInput,
  MarkEligibleInput,
  MarkIneligibleInput,
  RequestClarificationInput,
  ReopenScreeningInput,
  ResolveDuplicateInput,
  SecondReviewInput,
  UpdateChecklistItemInput,
} from "./screeningValidation";

async function computeClarificationDeadline(): Promise<Date> {
  const hours = await getNumericSettingValue(SETTINGS_KEYS.CLARIFICATION_DEADLINE_HOURS);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/**
 * Notification Infrastructure's first real, wired consumer (Phase 1) —
 * an eligibility decision is a clean, already-existing trigger point to
 * prove the outbox actually delivers, without taking on Interview
 * Module's reminder wiring (a separate phase). `applicantFacingComment`
 * is deliberately the only free-text field ever passed through to the
 * applicant — `reasonForDecision`/`integrityNote` (internal,
 * screener-only) are never forwarded here, matching docs/NOTIFICATIONS
 * .md's "never send internal-only content to applicants" rule. A
 * *delivery* failure is recorded on its own row and never blocks or
 * rolls back the screening decision (enqueueNotification's own
 * immediate-send path already catches that). This function additionally
 * catches around the enqueue call itself — an unknown event or a
 * missing template is a real configuration gap worth logging loudly,
 * but it must never be the reason a screener's actual eligibility
 * decision fails to save.
 */
async function notifyApplicant(
  event: NotificationEventKey,
  applicationId: string,
  variables: Record<string, string>,
  applicantFacingComment?: string,
) {
  try {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { applicantId: true, applicant: { select: { firstName: true, email: true } } },
    });
    if (!application) return;

    await enqueueNotification({
      event,
      recipient: { type: "APPLICANT", applicantId: application.applicantId, email: application.applicant.email },
      variables: { applicantFirstName: application.applicant.firstName, ...variables },
      applicantFacingComment,
      relatedEntityType: "Application",
      relatedEntityId: applicationId,
      createdById: null,
    });
  } catch (error) {
    logger.error("eligibility.notify_applicant_failed", {
      event,
      applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Recomputes automatic pre-checks (§11.1) and writes them as
 * `isAutomatic: true` checklist rows — but only for an item that has no
 * screener-set value yet. Never overwrites a row a human has already
 * touched (`isAutomatic: false`), so re-running this (e.g. every time
 * the workspace is opened, to pick up a newly-added document) can never
 * silently erase a screener's own decision.
 */
async function refreshAutomaticPreChecks(screeningId: string, applicationId: string) {
  const [application, existingItems] = await Promise.all([
    prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { applicant: true, documents: true, cohort: true },
    }),
    prisma.eligibilityChecklistItem.findMany({ where: { screeningId } }),
  ]);

  const exactDuplicates = await findExactDuplicates(applicationId, application.cohortId);

  const ctx: PreCheckContext = {
    applicant: application.applicant,
    application,
    documentTypes: application.documents.map((d) => d.type),
    essayAnswerKeys: Object.entries((application.essayAnswers as Record<string, string> | null) ?? {})
      .filter(([, value]) => Boolean(value?.trim()))
      .map(([key]) => key),
    applicationClosesAt: application.cohort.applicationClosesAt,
    hasExactDuplicate: exactDuplicates.length > 0,
  };

  const existingByKey = new Map(existingItems.map((item) => [`${item.section}:${item.itemKey}`, item]));

  for (const { section, item } of ALL_CHECKLIST_ITEMS) {
    const existing = existingByKey.get(`${section}:${item.key}`);
    if (existing && !existing.isAutomatic) continue; // a screener already recorded this — never overwritten

    const evaluator = section === "DOCUMENT" ? evaluateDocumentItem : section === "BASELINE" ? evaluateBaselineItem : evaluateIntegrityItem;
    const suggestion = evaluator(item.key, ctx);
    if (!suggestion && existing) continue; // nothing new to suggest, leave the prior automatic row as-is
    if (!suggestion) continue; // no suggestion and no existing row — leave blank for the screener

    await repo.upsertChecklistItem(prisma, screeningId, section, item.key, {
      status: suggestion.status,
      comment: suggestion.detail,
      isAutomatic: true,
      updatedById: null,
    });
  }

  if (exactDuplicates.length > 0) {
    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.ELIGIBILITY_DUPLICATE_DETECTED,
      entityType: "EligibilityScreening",
      entityId: screeningId,
      metadata: { applicationId, matches: exactDuplicates },
    });
  }

  return exactDuplicates;
}

/** §7 — the full screening workspace for one application: the record, every checklist item (pre-checks refreshed first), and any live duplicate matches. */
export async function getScreeningWorkspace(actorId: string, applicationId: string) {
  await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_VIEW);

  const screening = await repo.ensureScreeningExists(applicationId);
  const duplicates = await refreshAutomaticPreChecks(screening.id, applicationId);
  const full = await repo.getScreeningById(screening.id);
  if (!full) throw new NotFoundError("That screening record doesn't exist.");
  return { screening: full, duplicates };
}

export async function listScreeningsForCohort(
  actorId: string,
  cohortId: string,
  filters: Parameters<typeof repo.listScreeningsForCohort>[1],
) {
  await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_VIEW);
  return repo.listScreeningsForCohort(cohortId, filters);
}

/** §7.1 — "Only valid authorised user accounts should be assignable" — never a hard-coded name. */
export async function assignScreener(actorId: string, input: AssignScreenerInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_ASSIGN);

  const screenerUser = await prisma.user.findUnique({ where: { id: input.screenerId } });
  if (!screenerUser || screenerUser.status !== "ACTIVE") {
    throw new ValidationError("That user account doesn't exist or isn't active.");
  }
  if (!permissionsForRole(screenerUser.role).includes(PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM)) {
    throw new ValidationError(`${screenerUser.name} doesn't hold a role authorised to perform eligibility screening.`);
  }

  const screening = await repo.ensureScreeningExists(input.applicationId);
  const wasAssigned = Boolean(screening.screenerId);

  const updated = await repo.assignScreener(screening.id, {
    screenerId: input.screenerId,
    assignedById: actor.id,
    status: screening.status === "PENDING_SCREENING" ? "IN_PROGRESS" : screening.status,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: wasAssigned ? AUDIT_ACTIONS.ELIGIBILITY_SCREENER_REASSIGNED : AUDIT_ACTIONS.ELIGIBILITY_SCREENER_ASSIGNED,
    entityType: "EligibilityScreening",
    entityId: screening.id,
    metadata: { applicationId: input.applicationId, screenerId: input.screenerId, previousScreenerId: screening.screenerId },
  });

  await prisma.notification.create({
    data: {
      userId: input.screenerId,
      type: "ELIGIBILITY_SCREENER_ASSIGNED",
      title: "You've been assigned an eligibility screening",
      entityType: "Application",
      entityId: input.applicationId,
    },
  });

  return updated;
}

function assertScreeningEditable(status: string) {
  if (["ELIGIBLE", "INELIGIBLE", "DISQUALIFIED"].includes(status)) {
    throw new ConflictError("This application's eligibility decision is already confirmed — reopen it before making further changes.");
  }
}

export async function updateChecklistItem(actorId: string, input: UpdateChecklistItemInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  assertScreeningEditable(screening.status);

  const updated = await repo.upsertChecklistItem(prisma, screening.id, input.section, input.itemKey, {
    status: input.status,
    comment: input.comment ?? null,
    isAutomatic: false,
    updatedById: actor.id,
  });

  if (screening.status === "PENDING_SCREENING") {
    await prisma.eligibilityScreening.update({ where: { id: screening.id }, data: { status: "IN_PROGRESS" } });
  }

  const isIntegrityFlag = input.section === "INTEGRITY" && input.status === "FLAG";
  await writeAuditLog({
    actorId: actor.id,
    action: isIntegrityFlag ? AUDIT_ACTIONS.ELIGIBILITY_INTEGRITY_FLAGGED : AUDIT_ACTIONS.ELIGIBILITY_CHECKLIST_ITEM_UPDATED,
    entityType: "EligibilityScreening",
    entityId: screening.id,
    metadata: { applicationId: input.applicationId, section: input.section, itemKey: input.itemKey, status: input.status },
  });

  return updated;
}

async function getChecklistRecords(screeningId: string): Promise<ChecklistItemRecord[]> {
  const items = await prisma.eligibilityChecklistItem.findMany({ where: { screeningId } });
  return items.map((i) => ({ section: i.section, itemKey: i.itemKey, status: i.status }));
}

/** §8.1 — every mandatory item must be resolved before this succeeds. */
export async function markEligible(actorId: string, input: MarkEligibleInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  assertScreeningEditable(screening.status);

  const check = canMarkEligible(await getChecklistRecords(screening.id));
  if (!check.ok) throw new ValidationError(check.reason);

  await repo.recordDecision(screening.id, {
    status: "ELIGIBLE",
    nextAction: "PROCEED",
    reasonForDecision: input.reasonForDecision,
    secondReviewRequired: input.secondReviewRequired,
    decidedById: actor.id,
  });

  await prisma.$transaction(async (tx) => {
    await repo.updateApplicationEligibilityStatus(tx, input.applicationId, { eligibilityStatus: "ELIGIBLE", stage: "UNDER_REVIEW" });
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_MARKED_ELIGIBLE,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { reason: input.reasonForDecision },
  });
  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_PROGRESSED_TO_REVIEW,
    entityType: "Application",
    entityId: input.applicationId,
  });

  // Release 1.5: configurable — mirrors the old automatic engine's own
  // auto-assignment call (modules/eligibility/service.ts), now
  // triggered by a human decision instead of a vacuous automatic pass.
  if (await getBooleanSettingValue(SETTINGS_KEYS.AUTOMATIC_ASSIGNMENT_ENABLED)) {
    await autoAssignReviewers(input.applicationId);
  }

  await notifyApplicant("ELIGIBLE", input.applicationId, {});

  return repo.getScreeningById(screening.id);
}

export async function requestClarification(actorId: string, input: RequestClarificationInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  assertScreeningEditable(screening.status);

  await repo.recordDecision(screening.id, {
    status: "CLARIFICATION_REQUIRED",
    nextAction: "CLARIFY",
    outstandingClarification: input.outstandingClarification,
    decidedById: actor.id,
    clarificationDeadlineAt: await computeClarificationDeadline(),
  });
  await repo.updateApplicationEligibilityStatus(prisma, input.applicationId, { eligibilityStatus: "CLARIFICATION_REQUIRED" });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_CLARIFICATION_REQUESTED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { outstandingClarification: input.outstandingClarification },
  });

  // The screener writes `outstandingClarification` specifically to be
  // read by the applicant (§7.1's own workflow purpose) — unlike
  // `reasonForDecision` elsewhere, this field is applicant-facing by
  // design, not internal justification.
  await notifyApplicant(
    "ELIGIBILITY_CLARIFICATION_REQUIRED",
    input.applicationId,
    { clarificationReason: input.outstandingClarification },
    input.outstandingClarification,
  );

  return repo.getScreeningById(screening.id);
}

/** The applicant (or whoever) has responded — screening resumes. */
export async function resolveClarification(actorId: string, applicationId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);

  const screening = await repo.ensureScreeningExists(applicationId);
  if (screening.status !== "CLARIFICATION_REQUIRED") {
    throw new ValidationError("This screening isn't currently awaiting clarification.");
  }

  await prisma.eligibilityScreening.update({
    where: { id: screening.id },
    data: { status: "IN_PROGRESS", outstandingClarification: null, clarificationDeadlineAt: null },
  });
  await repo.updateApplicationEligibilityStatus(prisma, applicationId, { eligibilityStatus: "PENDING" });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_CLARIFICATION_RESOLVED,
    entityType: "Application",
    entityId: applicationId,
  });

  await notifyApplicant("ELIGIBILITY_CLARIFICATION_RESOLVED", applicationId, {});

  return repo.getScreeningById(screening.id);
}

export async function markIneligible(actorId: string, input: MarkIneligibleInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  assertScreeningEditable(screening.status);

  await repo.recordDecision(screening.id, {
    status: "INELIGIBLE",
    nextAction: "REJECT",
    reasonForDecision: input.reasonForDecision,
    decidedById: actor.id,
  });
  await repo.updateApplicationEligibilityStatus(prisma, input.applicationId, { eligibilityStatus: "INELIGIBLE" });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_MARKED_INELIGIBLE,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { reason: input.reasonForDecision },
  });

  // `input.reasonForDecision` is deliberately not forwarded — see the
  // INELIGIBLE event's own doc comment in eventCatalogue.ts.
  await notifyApplicant("INELIGIBLE", input.applicationId, {});

  return repo.getScreeningById(screening.id);
}

export async function escalate(actorId: string, input: EscalateInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  assertScreeningEditable(screening.status);

  await prisma.eligibilityScreening.update({
    where: { id: screening.id },
    data: {
      status: "ESCALATED",
      nextAction: "ESCALATE",
      reasonForDecision: input.reasonForDecision,
      dateReviewed: new Date(),
      clarificationDeadlineAt: null,
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_ESCALATED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { reason: input.reasonForDecision },
  });

  return repo.getScreeningById(screening.id);
}

/** §8.4 — a stricter permission than the other three decisions. */
export async function markDisqualified(actorId: string, input: MarkDisqualifiedInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_DISQUALIFY);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  assertScreeningEditable(screening.status);

  await repo.recordDecision(screening.id, {
    status: "DISQUALIFIED",
    nextAction: "REJECT",
    integrityNote: input.integrityNote,
    reasonForDecision: input.integrityNote,
    decidedById: actor.id,
  });
  await repo.updateApplicationEligibilityStatus(prisma, input.applicationId, { eligibilityStatus: "DISQUALIFIED" });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_MARKED_DISQUALIFIED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { integrityNote: input.integrityNote },
  });

  // `input.integrityNote` is never forwarded to the applicant — a
  // disqualification is always for an integrity reason, exactly the
  // category of internal-only content docs/NOTIFICATIONS.md's rule
  // exists to keep out of an applicant-facing message.
  await notifyApplicant("DISQUALIFIED", input.applicationId, {});

  return repo.getScreeningById(screening.id);
}

function labelForItemKey(itemKey: string): string {
  const found = ALL_CHECKLIST_ITEMS.find((entry) => entry.item.key === itemKey);
  return found?.item.label ?? itemKey;
}

/**
 * The PAM-P Application Eligibility Criteria, run automatically and
 * authoritatively — contrast the retired `modules/eligibility/service
 * .ts` engine, whose result never became `Application.eligibilityStatus`
 * on its own. Triggered once per application on import
 * (`modules/import/service.ts`) and in bulk via
 * `runAutomaticEligibilityForCohort` for applications imported before
 * this existed. A screening a human has already confirmed
 * (ELIGIBLE/INELIGIBLE/DISQUALIFIED) is never touched — re-running this
 * is always safe. An admin can still override any outcome by hand
 * through `markEligible`/`markIneligible`/`markDisqualified`/
 * `requestClarification` exactly as before; this only replaces the step
 * of a human walking the checklist for the first pass.
 */
export async function runAutomaticEligibilityDecision(applicationId: string) {
  const screening = await repo.ensureScreeningExists(applicationId);
  if (["ELIGIBLE", "INELIGIBLE", "DISQUALIFIED"].includes(screening.status)) {
    return repo.getScreeningById(screening.id);
  }

  await refreshAutomaticPreChecks(screening.id, applicationId);
  const items = await getChecklistRecords(screening.id);
  const decision = decideAutomaticEligibility(items);

  if (decision.outcome === "CLARIFICATION_REQUIRED") {
    const clarificationMessage = `Please provide or confirm: ${decision.clarifyItems.map(labelForItemKey).join(", ")}.`;
    await repo.recordDecision(screening.id, {
      status: "CLARIFICATION_REQUIRED",
      nextAction: "CLARIFY",
      outstandingClarification: clarificationMessage,
      decidedById: null,
      clarificationDeadlineAt: await computeClarificationDeadline(),
    });
    await repo.updateApplicationEligibilityStatus(prisma, applicationId, { eligibilityStatus: "CLARIFICATION_REQUIRED" });
    // A case that needs a human is a case that needs an owner —
    // randomly assigned across whoever currently holds
    // ELIGIBILITY_SCREENING_PERFORM, so nothing sits Unassigned once
    // the automatic engine has done what it can. Idempotent: never
    // reassigns a screening that already has a reviewer.
    await autoAssignRandomReviewer(screening.id, applicationId, "CLARIFICATION_REQUIRED");
    await notifyApplicant(
      "ELIGIBILITY_CLARIFICATION_REQUIRED",
      applicationId,
      { clarificationReason: clarificationMessage },
      clarificationMessage,
    );
  } else if (decision.outcome === "INELIGIBLE") {
    await repo.recordDecision(screening.id, {
      status: "INELIGIBLE",
      nextAction: "REJECT",
      reasonForDecision: decision.reason,
      decidedById: null,
    });
    await repo.updateApplicationEligibilityStatus(prisma, applicationId, { eligibilityStatus: "INELIGIBLE" });
    await notifyApplicant("INELIGIBLE", applicationId, {});
  } else if (decision.outcome === "DISQUALIFIED") {
    await repo.recordDecision(screening.id, {
      status: "DISQUALIFIED",
      nextAction: "REJECT",
      integrityNote: decision.reason,
      reasonForDecision: decision.reason,
      decidedById: null,
    });
    await repo.updateApplicationEligibilityStatus(prisma, applicationId, { eligibilityStatus: "DISQUALIFIED" });
    await notifyApplicant("DISQUALIFIED", applicationId, {});
  } else {
    await repo.recordDecision(screening.id, {
      status: "ELIGIBLE",
      nextAction: "PROCEED",
      reasonForDecision: decision.reason,
      decidedById: null,
    });
    await prisma.$transaction(async (tx) => {
      await repo.updateApplicationEligibilityStatus(tx, applicationId, { eligibilityStatus: "ELIGIBLE", stage: "UNDER_REVIEW" });
    });
    if (await getBooleanSettingValue(SETTINGS_KEYS.AUTOMATIC_ASSIGNMENT_ENABLED)) {
      await autoAssignReviewers(applicationId);
    }
    await notifyApplicant("ELIGIBLE", applicationId, {});
  }

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.ELIGIBILITY_AUTOMATIC_CHECK_PERFORMED,
    entityType: "Application",
    entityId: applicationId,
    metadata: {
      outcome: decision.outcome,
      reason: decision.reason,
      failedItems: decision.failedItems,
      clarifyItems: decision.clarifyItems,
      authoritative: true,
    },
  });

  return repo.getScreeningById(screening.id);
}

/** Bulk entry point for applications imported before the automatic engine existed, or still awaiting a confirmed decision — mirrors `remediateExistingApplications`'s own permission placement. */
export async function runAutomaticEligibilityForCohort(actorId: string, cohortId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_ASSIGN);

  const pending = await prisma.application.findMany({
    where: { cohortId, deletedAt: null, eligibilityScreening: { status: { in: ["PENDING_SCREENING", "IN_PROGRESS"] } } },
    select: { id: true },
  });

  const outcomes: Record<string, number> = {};
  for (const application of pending) {
    const result = await runAutomaticEligibilityDecision(application.id);
    const status = result?.status ?? "UNKNOWN";
    outcomes[status] = (outcomes[status] ?? 0) + 1;
  }

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_AUTOMATIC_CHECK_PERFORMED,
    entityType: "Cohort",
    entityId: cohortId,
    metadata: { outcome: "BULK_RUN_AUTHORITATIVE", processed: pending.length, outcomes },
  });

  return { processed: pending.length, outcomes };
}

export async function performSecondReview(actorId: string, input: SecondReviewInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_SECOND_REVIEW);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  if (!screening.secondReviewRequired) {
    throw new ValidationError("This screening wasn't flagged as requiring a second review.");
  }
  if (screening.screenerId === actor.id) {
    throw new ValidationError("The original screener cannot perform their own second review.");
  }
  if (screening.secondReviewCompletedAt) {
    throw new ConflictError("A second review has already been recorded for this screening.");
  }

  await repo.recordSecondReview(screening.id, { secondReviewerId: actor.id, secondReviewNote: input.note ?? null });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_SECOND_REVIEW_COMPLETED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { note: input.note ?? null },
  });

  return repo.getScreeningById(screening.id);
}

/** System-Administrator-only — mirrors ranking.reopen/review_scores.reopen's exact placement. */
export async function reopenScreening(actorId: string, input: ReopenScreeningInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_REOPEN);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  if (!["ELIGIBLE", "INELIGIBLE", "DISQUALIFIED"].includes(screening.status)) {
    throw new ValidationError("This screening doesn't currently have a confirmed decision to reopen.");
  }

  await repo.reopenScreening(screening.id, { reopenedById: actor.id, reopenReason: input.reason, status: "IN_PROGRESS" });
  await repo.updateApplicationEligibilityStatus(prisma, input.applicationId, { eligibilityStatus: "PENDING" });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_SCREENING_REOPENED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { reason: input.reason, previousStatus: screening.status },
  });

  return repo.getScreeningById(screening.id);
}

/**
 * Secretariat-only — extends one application's clarification-response
 * window past the configured default
 * (`eligibility.clarification_deadline_hours`), with a mandatory reason.
 * `additionalHours` (if given) is added from *now*, not from the current
 * deadline — extending a deadline that's already passed still gives the
 * applicant a fresh, full window rather than a still-expired one.
 */
export async function extendClarificationDeadline(actorId: string, input: ExtendClarificationDeadlineInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_EXTEND_DEADLINE);

  const screening = await repo.ensureScreeningExists(input.applicationId);
  if (screening.status !== "CLARIFICATION_REQUIRED") {
    throw new ValidationError("This screening isn't currently awaiting clarification.");
  }

  const hours = input.additionalHours ?? (await getNumericSettingValue(SETTINGS_KEYS.CLARIFICATION_DEADLINE_HOURS));
  const newDeadlineAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const previousDeadline = screening.clarificationDeadlineAt;

  await repo.extendClarificationDeadline(screening.id, { newDeadlineAt, extendedById: actor.id, reason: input.reason });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_CLARIFICATION_DEADLINE_EXTENDED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { reason: input.reason, previousDeadline: previousDeadline?.toISOString() ?? null, newDeadline: newDeadlineAt.toISOString() },
  });

  return repo.getScreeningById(screening.id);
}

/**
 * Triggered by the external scheduler hitting
 * `app/api/cron/process-notifications` (same wiring as
 * `sendDueReminders`) — every screening still `CLARIFICATION_REQUIRED`
 * past its `clarificationDeadlineAt` is auto-marked `INELIGIBLE`, exactly
 * as if a screener had called `markIneligible` with the reason
 * "Clarification deadline missed". Naturally idempotent: transitioning
 * out of `CLARIFICATION_REQUIRED` removes a screening from this
 * function's own selection criteria (`repo.listExpiredClarifications`),
 * so a screening already processed can never be double-counted on a
 * later run.
 */
export async function checkMissedClarificationDeadlines() {
  const expired = await repo.listExpiredClarifications(new Date());
  const reason = "Clarification deadline missed";

  for (const { id, applicationId } of expired) {
    await repo.recordDecision(id, {
      status: "INELIGIBLE",
      nextAction: "REJECT",
      reasonForDecision: reason,
      decidedById: null,
    });
    await repo.updateApplicationEligibilityStatus(prisma, applicationId, { eligibilityStatus: "INELIGIBLE" });

    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.ELIGIBILITY_CLARIFICATION_DEADLINE_MISSED,
      entityType: "Application",
      entityId: applicationId,
      metadata: { reason },
    });

    await notifyApplicant("INELIGIBLE", applicationId, {});
  }

  return { processed: expired.length };
}

/** §8.5 — retain one, preserve the other, never delete either. */
export async function resolveDuplicate(actorId: string, input: ResolveDuplicateInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);

  if (input.applicationId === input.duplicateOfApplicationId) {
    throw new ValidationError("An application can't be marked a duplicate of itself.");
  }

  await prisma.application.update({
    where: { id: input.applicationId },
    data: {
      duplicateOfId: input.duplicateOfApplicationId,
      duplicateResolvedById: actor.id,
      duplicateResolvedAt: new Date(),
      duplicateResolutionNote: input.note,
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_DUPLICATE_RESOLVED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { retainedApplicationId: input.duplicateOfApplicationId, note: input.note },
  });

  return prisma.application.findUniqueOrThrow({ where: { id: input.applicationId } });
}

/**
 * §10 Existing Applicant Remediation — the actual bug fix, applied to
 * data. Only ever touches an application that was auto-approved by the
 * old vacuous-pass engine and never actually decided by a human
 * (`screening` missing or `decidedById` still null) — a legitimate,
 * screener-confirmed decision is never touched. Naturally idempotent: a
 * remediated application's `eligibilityStatus` becomes `PENDING`, which
 * no longer matches this function's own selection criteria, so
 * re-running it is always a no-op the second time.
 */
export async function remediateExistingApplications(actorId: string, cohortId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_ASSIGN);

  const candidates = await prisma.application.findMany({
    where: {
      cohortId,
      eligibilityStatus: { in: ["ELIGIBLE", "INELIGIBLE"] },
      OR: [{ eligibilityScreening: null }, { eligibilityScreening: { decidedById: null } }],
    },
    select: { id: true, eligibilityStatus: true, stage: true },
  });

  let remediated = 0;
  for (const application of candidates) {
    await prisma.$transaction(async (tx) => {
      await tx.eligibilityScreening.upsert({
        where: { applicationId: application.id },
        update: {},
        create: { applicationId: application.id },
      });
      await tx.application.update({
        where: { id: application.id },
        data: { eligibilityStatus: "PENDING", stage: application.stage === "UNDER_REVIEW" ? "IMPORTED" : application.stage },
      });
    });

    await writeAuditLog({
      actorId: actor.id,
      action: AUDIT_ACTIONS.ELIGIBILITY_REMEDIATED,
      entityType: "Application",
      entityId: application.id,
      metadata: { previousEligibilityStatus: application.eligibilityStatus, source: "vacuous_auto_engine_remediation" },
    });
    remediated++;
  }

  return { scanned: candidates.length, remediated };
}
