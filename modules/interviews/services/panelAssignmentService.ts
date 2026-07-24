import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import {
  ConflictError,
  ConflictOfInterestError,
  DuplicateAssignmentError,
  NoEligibleReviewersError,
  NotFoundError,
  ReviewConcurrencyError,
  ReviewerAtCapacityError,
  ReviewerUnavailableError,
  SelfAssignmentError,
  ValidationError,
} from "@/lib/errors";
import type { ConflictSource } from "@/lib/generated/prisma/client";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getNumericSettingValue } from "@/lib/settings/service";

import { assertPanelistTransition } from "../domain/panelLifecycle";
import * as conflictRepo from "../repositories/conflictRepository";
import * as interviewRepo from "../repositories/interviewRepository";
import * as panelistRepo from "../repositories/panelistRepository";
import * as shortlistRepo from "../repositories/shortlistRepository";
import type {
  DeclareInterviewConflictInput,
  ReassignPanelistInput,
  ScheduleInterviewInput,
  SetInterviewerCapacityInput,
} from "../validation/schemas";

// Reused directly from the review assignment engine — both a pure
// domain function over generic candidate-snapshot shapes; Release 1
// Module 1's own brief: "Reuse the existing Assignment Engine
// architecture wherever appropriate."
import { filterEligibleReviewers, type ExclusionReason, type ReviewerCandidateSnapshot } from "@/modules/reviews/domain/reviewerEligibility";
import { selectLeastLoadedReviewers, type ReviewerWorkload } from "@/modules/reviews/domain/workloadBalancing";

// ---------------------------------------------------------------------------
// Candidate snapshot building (mirrors buildCandidateSnapshots/
// buildSingleCandidateSnapshot in modules/reviews/services/assignmentService.ts)
// ---------------------------------------------------------------------------

async function buildCandidateSnapshots(
  interviewId: string,
  applicationId: string,
  programmeId: string,
  interviewerIds?: string[],
): Promise<ReviewerCandidateSnapshot[]> {
  const pool = interviewerIds
    ? await prisma.user.findMany({ where: { id: { in: interviewerIds }, role: "INTERVIEWER" }, select: { id: true, status: true } })
    : await panelistRepo.listActiveInterviewers().then((users) =>
        prisma.user.findMany({ where: { id: { in: users.map((u) => u.id) } }, select: { id: true, status: true } }),
      );
  const ids = pool.map((u) => u.id);

  const [seatCounts, capacities, conflicts, alreadyOnPanel] = await Promise.all([
    panelistRepo.countActivePanelSeats(ids),
    panelistRepo.listInterviewerCapacities(ids, programmeId),
    conflictRepo.listConflictsForInterviewers(applicationId, ids),
    panelistRepo.getActivePanelistsForUserIds(interviewId, ids),
  ]);

  const seatCountByUser = new Map(seatCounts.map((c) => [c.userId, c._count._all]));
  const capacityByUser = new Map(capacities.map((c) => [c.interviewerId, c]));
  const conflictedIds = new Set(conflicts.map((c) => c.interviewerId));
  const alreadyOnPanelIds = new Set(alreadyOnPanel.map((p) => p.userId));

  return pool.map((interviewer) => {
    const capacity = capacityByUser.get(interviewer.id);
    return {
      reviewerId: interviewer.id,
      isActiveReviewerAccount: interviewer.status === "ACTIVE",
      isAvailable: capacity ? capacity.isAvailable : true,
      activeAssignmentCount: seatCountByUser.get(interviewer.id) ?? 0,
      maxConcurrentAssignments: capacity ? capacity.maxConcurrentInterviews : 10,
      hasConflictOfInterest: conflictedIds.has(interviewer.id),
      alreadyAssignedToThisApplication: alreadyOnPanelIds.has(interviewer.id),
    };
  });
}

async function buildSingleCandidateSnapshot(interviewId: string, applicationId: string, programmeId: string, interviewerId: string) {
  const [snapshot] = await buildCandidateSnapshots(interviewId, applicationId, programmeId, [interviewerId]);
  if (!snapshot) throw new NotFoundError("That interviewer doesn't exist or is not an Interviewer.");
  return snapshot;
}

function throwForExclusion(reason: ExclusionReason | undefined): never {
  switch (reason) {
    case "SELF_ASSIGNMENT":
      throw new SelfAssignmentError("You cannot assign yourself to an interview panel.");
    case "INACTIVE_ACCOUNT":
      throw new ValidationError("This interviewer's account is not active.");
    case "UNAVAILABLE":
      throw new ReviewerUnavailableError("This interviewer is currently marked unavailable.");
    case "AT_CAPACITY":
      throw new ReviewerAtCapacityError("This interviewer is already at their maximum concurrent interviews.");
    case "CONFLICT_OF_INTEREST":
      throw new ConflictOfInterestError("This interviewer has a recorded conflict of interest with this application.");
    case "ALREADY_ASSIGNED_TO_APPLICATION":
      throw new DuplicateAssignmentError("This interviewer is already on this interview's panel.");
    default:
      throw new NoEligibleReviewersError("No eligible interviewers are available for this panel.");
  }
}

async function getProgrammeIdForApplication(applicationId: string): Promise<string> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { cohort: { select: { programmeId: true } } },
  });
  if (!application) throw new NotFoundError("That application doesn't exist.");
  return application.cohort.programmeId;
}

// ---------------------------------------------------------------------------
// Interview shortlist ("Top 70")
// ---------------------------------------------------------------------------

/**
 * Reads every ranking-ready application's `ApplicationScore.reviewAverage`
 * (populated by `modules/scoring/services/scoreAggregationService.ts`),
 * takes the top `ranking.top70Size` (Configuration Centre), and records
 * the result as a `RankingSnapshot` named "Interview Shortlist" — the
 * exact generalized mechanism `docs/database.md` designed for this
 * purpose, not a bespoke table.
 */
export async function generateInterviewShortlist(actorId: string, cohortId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_ASSIGNMENTS_MANAGE);

  const size = await getNumericSettingValue("ranking.top70Size");
  const ranked = await shortlistRepo.listRankedApplicationsByReviewScore(cohortId);
  const top = ranked.slice(0, size);

  if (top.length === 0) {
    throw new ValidationError("No applications have a computed review score yet — nothing to shortlist.");
  }

  const snapshot = await shortlistRepo.createShortlistSnapshot(
    cohortId,
    "Interview Shortlist",
    size,
    actor.id,
    top.map((entry, index) => ({ applicationId: entry.applicationId, rank: index + 1, score: entry.reviewAverage! })),
  );

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_SHORTLIST_GENERATED,
    entityType: "RankingSnapshot",
    entityId: snapshot.id,
    cohortId,
    metadata: { targetSize: size, actualSize: top.length },
  });

  return snapshot;
}

/**
 * A panellist's own "my interview queue" (Module 2) — every interview
 * they currently hold an active seat on. Mirrors
 * modules/reviews/services/assignmentService.ts's `listMyAssignments`: a
 * thin passthrough with no permission check of its own, since the
 * calling page already gates on `interviews.view` and the query itself
 * is scoped to the caller's own userId, the same "no argument here could
 * ever surface someone else's queue" pattern as the review side.
 */
export async function listMyInterviews(actorId: string) {
  return panelistRepo.listActivePanelistRowsForUser(actorId);
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export async function scheduleInterview(actorId: string, cohortId: string, input: ScheduleInterviewInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_ASSIGNMENTS_MANAGE);

  const interview = await interviewRepo.createInterview({
    applicationId: input.applicationId,
    cohortId,
    scheduledAt: new Date(input.scheduledAt),
    durationMinutes: input.durationMinutes,
    meetingLink: input.meetingLink ?? null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_SCHEDULED,
    entityType: "Interview",
    entityId: interview.id,
    cohortId,
    metadata: { applicationId: input.applicationId, scheduledAt: input.scheduledAt },
  });

  return interview;
}

// ---------------------------------------------------------------------------
// Panel assignment (§Module 1 — "Four panellists per applicant", "Equal
// workload distribution")
// ---------------------------------------------------------------------------

/** Idempotent: an interview that already has active panelists is left alone. */
export async function autoAssignPanel(interviewId: string) {
  const interview = await interviewRepo.getInterview(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");

  const existing = await panelistRepo.listActivePanelistsForInterview(interviewId);
  if (existing.length > 0) {
    return { assigned: false as const, interviewerIds: [], reason: "ALREADY_ASSIGNED" as const };
  }

  const programmeId = await getProgrammeIdForApplication(interview.applicationId);
  const panelSize = await getNumericSettingValue("interview.panellist_count");

  const snapshots = await buildCandidateSnapshots(interviewId, interview.applicationId, programmeId);
  const { eligible } = filterEligibleReviewers(snapshots, null);
  const workloads: ReviewerWorkload[] = eligible.map((c) => ({
    reviewerId: c.reviewerId,
    activeAssignmentCount: c.activeAssignmentCount,
    maxConcurrentAssignments: c.maxConcurrentAssignments,
  }));
  const { selected } = selectLeastLoadedReviewers(workloads, panelSize);

  if (selected.length < panelSize) {
    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.INTERVIEW_PANEL_ASSIGNED,
      entityType: "Interview",
      entityId: interviewId,
      metadata: { outcome: "SKIPPED", reason: `Only ${selected.length} eligible interviewer(s) available; ${panelSize} required.` },
    });
    return { assigned: false as const, interviewerIds: [] };
  }

  await prisma.$transaction(async (tx) => {
    for (const userId of selected) {
      await panelistRepo.createPanelist(tx, { interviewId, userId, assignedMethod: "AUTO" });
    }
  });

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.INTERVIEW_PANEL_ASSIGNED,
    entityType: "Interview",
    entityId: interviewId,
    metadata: { outcome: "ASSIGNED", interviewerIds: selected },
  });

  return { assigned: true as const, interviewerIds: selected };
}

export async function reassignPanelist(actorId: string, input: ReassignPanelistInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_ASSIGNMENTS_MANAGE);

  const panelist = await panelistRepo.getPanelist(input.panelistId);
  if (!panelist) throw new NotFoundError("That panel seat doesn't exist.");
  if (input.newInterviewerId === panelist.userId) {
    throw new ConflictError("Choose a different interviewer to reassign to.");
  }

  assertPanelistTransition(panelist.status, "REASSIGNED");

  const applicationId = (await interviewRepo.getInterview(panelist.interviewId))!.applicationId;
  const programmeId = await getProgrammeIdForApplication(applicationId);
  const snapshot = await buildSingleCandidateSnapshot(panelist.interviewId, applicationId, programmeId, input.newInterviewerId);
  const { eligible, excluded } = filterEligibleReviewers([snapshot], actor.id);
  if (eligible.length === 0) throwForExclusion(excluded[0]?.reason);

  const newPanelist = await prisma.$transaction(async (tx) => {
    const closed = await panelistRepo.updatePanelistStatus(tx, input.panelistId, panelist.status, {
      status: "REASSIGNED",
      reassignedAt: new Date(),
      reassignedById: actor.id,
      reassignReason: input.reason,
    });
    if (closed.count === 0) throw new ReviewConcurrencyError();

    return panelistRepo.createPanelist(tx, {
      interviewId: panelist.interviewId,
      userId: input.newInterviewerId,
      assignedMethod: "MANUAL",
      assignedById: actor.id,
      reassignedFromId: panelist.id,
    });
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_PANELIST_REASSIGNED,
    entityType: "InterviewPanelist",
    entityId: newPanelist.id,
    metadata: {
      reason: input.reason,
      fromPanelistId: panelist.id,
      fromInterviewerId: panelist.userId,
      toInterviewerId: input.newInterviewerId,
      interviewId: panelist.interviewId,
    },
  });

  return newPanelist;
}

export async function cancelPanelist(actorId: string, panelistId: string, reason: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_ASSIGNMENTS_MANAGE);

  const panelist = await panelistRepo.getPanelist(panelistId);
  if (!panelist) throw new NotFoundError("That panel seat doesn't exist.");
  assertPanelistTransition(panelist.status, "CANCELLED");

  const result = await panelistRepo.updatePanelistStatus(prisma, panelistId, panelist.status, {
    status: "CANCELLED",
    cancelledAt: new Date(),
    cancelledById: actor.id,
    cancelReason: reason,
  });
  if (result.count === 0) throw new ReviewConcurrencyError();

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_PANELIST_CANCELLED,
    entityType: "InterviewPanelist",
    entityId: panelistId,
    metadata: { reason, interviewId: panelist.interviewId, interviewerId: panelist.userId },
  });
}

// ---------------------------------------------------------------------------
// Conflicts of interest
// ---------------------------------------------------------------------------

export async function declareInterviewConflict(actorId: string, input: DeclareInterviewConflictInput) {
  const actor = await requirePermission(
    actorId,
    actorId === input.interviewerId ? PERMISSIONS.INTERVIEW_CONFLICTS_DECLARE : PERMISSIONS.INTERVIEW_CONFLICTS_MANAGE,
  );

  const application = await prisma.application.findUnique({ where: { id: input.applicationId }, select: { id: true } });
  if (!application) throw new NotFoundError("That application doesn't exist.");

  const source: ConflictSource = actor.id === input.interviewerId ? "SELF_DECLARED" : "ADMIN_RECORDED";

  const conflict = await conflictRepo.createConflict({
    interviewerId: input.interviewerId,
    applicationId: input.applicationId,
    reason: input.reason,
    source,
    declaredById: actor.id,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_CONFLICT_DECLARED,
    entityType: "InterviewConflictOfInterest",
    entityId: conflict.id,
    metadata: { interviewerId: input.interviewerId, applicationId: input.applicationId, source, reason: input.reason },
  });

  return conflict;
}

// ---------------------------------------------------------------------------
// Interviewer capacity
// ---------------------------------------------------------------------------

export async function setInterviewerCapacity(actorId: string, input: SetInterviewerCapacityInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_ASSIGNMENTS_MANAGE);

  const before = await panelistRepo.getInterviewerCapacity(input.interviewerId, input.programmeId);

  const capacity = await panelistRepo.upsertInterviewerCapacity(input.interviewerId, input.programmeId, {
    maxConcurrentInterviews: input.maxConcurrentInterviews,
    isAvailable: input.isAvailable,
    unavailableReason: input.unavailableReason ?? undefined,
    unavailableUntil: input.unavailableUntil ? new Date(input.unavailableUntil) : undefined,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEWER_CAPACITY_CHANGED,
    entityType: "InterviewerCapacity",
    entityId: capacity.id,
    metadata: {
      interviewerId: input.interviewerId,
      programmeId: input.programmeId,
      before: before ? { maxConcurrentInterviews: before.maxConcurrentInterviews, isAvailable: before.isAvailable } : null,
      after: { maxConcurrentInterviews: capacity.maxConcurrentInterviews, isAvailable: capacity.isAvailable },
    },
  });

  return capacity;
}
