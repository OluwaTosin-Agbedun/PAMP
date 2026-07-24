import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import {
  AuthorisationError,
  ConflictError,
  ConflictOfInterestError,
  DuplicateAssignmentError,
  NoEligibleReviewersError,
  NotFoundError,
  ReviewConcurrencyError,
  ReviewerAtCapacityError,
  ReviewerUnavailableError,
  SelfAssignmentError,
  ThirdReviewAlreadyExistsError,
  ValidationError,
} from "@/lib/errors";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ConflictSource, ReviewSlot } from "@/lib/generated/prisma/client";
import { requirePermission } from "@/lib/permissions/service";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { Role } from "@/lib/rbac/roles";
import { SETTINGS_KEYS, getNumericSetting } from "@/lib/settings/service";
import { recomputeReviewAverage } from "@/modules/scoring/services/scoreAggregationService";

import { assertAssignmentTransition } from "../domain/assignmentLifecycle";
import { filterEligibleReviewers, type ExclusionReason, type ReviewerCandidateSnapshot } from "../domain/reviewerEligibility";
import { calculateDivergencePercent, calculateFinalScoreAfterThirdReview, exceedsDivergenceThreshold } from "../domain/thirdReviewEngine";
import { selectLeastLoadedReviewers, type ReviewerWorkload } from "../domain/workloadBalancing";
import * as assignmentRepo from "../repositories/assignmentRepository";
import * as capacityRepo from "../repositories/reviewerCapacityRepository";
import * as conflictRepo from "../repositories/conflictOfInterestRepository";
import * as escalationRepo from "../repositories/escalationRepository";
import type {
  CancelAssignmentInput,
  DeclareConflictOfInterestInput,
  ManualAssignReviewerInput,
  ReassignAssignmentInput,
  SetReviewerCapacityInput,
} from "../validation/assignmentSchemas";

/**
 * The review assignment engine (Phase 3B). Everything that decides *who*
 * reviews *what*, and enforces the fairness/independence/COI rules in
 * §2 of the brief — orchestration, permissions, transactions, audit.
 * Reuses modules/reviews/domain/{reviewerEligibility,workloadBalancing,
 * thirdReviewEngine,assignmentLifecycle}.ts for every actual rule; this
 * file is I/O and sequencing only.
 *
 * `autoAssignReviewers` replaces (not duplicates) Sequence 1's
 * modules/reviews/assignment.ts — same exported name and signature, so
 * modules/eligibility/service.ts's one call site needed only an import
 * path change, per the standing "refactor rather than duplicate"
 * instruction.
 */

async function loadReviewerPool(reviewerIds?: string[]) {
  return prisma.user.findMany({
    where: { role: Role.APPLICATION_REVIEWER, ...(reviewerIds ? { id: { in: reviewerIds } } : {}) },
    select: { id: true, status: true },
  });
}

async function buildCandidateSnapshots(
  applicationId: string,
  programmeId: string,
  reviewerIds?: string[],
): Promise<ReviewerCandidateSnapshot[]> {
  const pool = await loadReviewerPool(reviewerIds);
  const ids = pool.map((r) => r.id);

  const [counts, capacities, conflictedIds, alreadyAssigned, defaultMax] = await Promise.all([
    assignmentRepo.countActiveAssignmentsForReviewers(ids),
    capacityRepo.listCapacitiesForReviewers(ids, programmeId),
    conflictRepo.listActiveConflictedReviewerIds(applicationId, ids),
    assignmentRepo.getActiveAssignmentsForReviewerIds(applicationId, ids),
    getNumericSetting(SETTINGS_KEYS.REVIEWER_DEFAULT_MAX_CONCURRENT_ASSIGNMENTS),
  ]);

  const capacityByReviewer = new Map(capacities.map((c) => [c.reviewerId, c]));
  const alreadyAssignedIds = new Set(alreadyAssigned.map((a) => a.reviewerId));

  return pool.map((reviewer) => {
    const capacity = capacityByReviewer.get(reviewer.id);
    return {
      reviewerId: reviewer.id,
      isActiveReviewerAccount: reviewer.status === "ACTIVE",
      isAvailable: capacity ? capacity.isAvailable : true,
      activeAssignmentCount: counts.get(reviewer.id) ?? 0,
      maxConcurrentAssignments: capacity ? capacity.maxConcurrentAssignments : defaultMax,
      hasConflictOfInterest: conflictedIds.has(reviewer.id),
      alreadyAssignedToThisApplication: alreadyAssignedIds.has(reviewer.id),
    };
  });
}

async function buildSingleCandidateSnapshot(applicationId: string, programmeId: string, reviewerId: string) {
  const [snapshot] = await buildCandidateSnapshots(applicationId, programmeId, [reviewerId]);
  if (!snapshot) throw new NotFoundError("That reviewer doesn't exist or is not a Reviewer.");
  return snapshot;
}

function throwForExclusion(reason: ExclusionReason | undefined): never {
  switch (reason) {
    case "SELF_ASSIGNMENT":
      throw new SelfAssignmentError();
    case "INACTIVE_ACCOUNT":
      throw new ValidationError("This reviewer's account is not active.");
    case "UNAVAILABLE":
      throw new ReviewerUnavailableError();
    case "AT_CAPACITY":
      throw new ReviewerAtCapacityError();
    case "CONFLICT_OF_INTEREST":
      throw new ConflictOfInterestError();
    case "ALREADY_ASSIGNED_TO_APPLICATION":
      throw new DuplicateAssignmentError();
    default:
      throw new NoEligibleReviewersError();
  }
}

/**
 * The workload-balancing pick (§6): loads the eligible candidate pool,
 * filters it (§13's rules, via reviewerEligibility.ts), then hands the
 * survivors to the pure balancing algorithm. Throws
 * `NoEligibleReviewersError` if fewer than `count` reviewers survive —
 * callers decide whether that's fatal or something to log and continue
 * past (see `autoAssignReviewers`, which treats it as a skip).
 */
async function selectReviewers(args: {
  applicationId: string;
  programmeId: string;
  count: number;
  excludeReviewerIds: string[];
  requestingActorId: string | null;
}) {
  const snapshots = await buildCandidateSnapshots(args.applicationId, args.programmeId);
  const candidates = snapshots.filter((s) => !args.excludeReviewerIds.includes(s.reviewerId));

  const { eligible } = filterEligibleReviewers(candidates, args.requestingActorId);

  const workloads: ReviewerWorkload[] = eligible.map((c) => ({
    reviewerId: c.reviewerId,
    activeAssignmentCount: c.activeAssignmentCount,
    maxConcurrentAssignments: c.maxConcurrentAssignments,
  }));

  const { selected, remaining } = selectLeastLoadedReviewers(workloads, args.count);

  if (selected.length < args.count) {
    throw new NoEligibleReviewersError(
      `Only ${selected.length} eligible reviewer(s) available for this application; ${args.count} required.`,
    );
  }

  return { selected, remaining };
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
// Automatic assignment (§2, §6)
// ---------------------------------------------------------------------------

/**
 * Idempotent: an application with any active assignment is left alone
 * rather than erroring or double-assigning — same guarantee Sequence 1's
 * original implementation made, preserved here.
 */
export async function autoAssignReviewers(applicationId: string) {
  const existing = await assignmentRepo.listActiveAssignmentsForApplication(applicationId);
  if (existing.length > 0) {
    return { assigned: false as const, reviewerIds: [], reason: "ALREADY_ASSIGNED" as const };
  }

  const programmeId = await getProgrammeIdForApplication(applicationId);

  let selection: Awaited<ReturnType<typeof selectReviewers>>;
  try {
    selection = await selectReviewers({
      applicationId,
      programmeId,
      // Release 1.5: sourced from configuration rather than a literal —
      // read-only in the Configuration Centre (see
      // SETTINGS_KEYS.REVIEWERS_PER_APPLICATION's registry entry for why
      // this can't actually be changed without an assignment-engine
      // redesign; the two-reviewer pairing below still assumes exactly 2).
      count: await getNumericSetting(SETTINGS_KEYS.REVIEWERS_PER_APPLICATION),
      excludeReviewerIds: [],
      requestingActorId: null,
    });
  } catch (err) {
    if (err instanceof NoEligibleReviewersError) {
      await writeAuditLog({
        actorId: null,
        action: AUDIT_ACTIONS.REVIEW_ASSIGNED,
        entityType: "Application",
        entityId: applicationId,
        metadata: { outcome: "SKIPPED", reason: err.message },
      });
      return { assigned: false as const, reviewerIds: [] };
    }
    throw err;
  }

  const [firstId, secondId] = selection.selected;

  await prisma.$transaction(async (tx) => {
    await assignmentRepo.createAssignment(tx, { applicationId, reviewerId: firstId, slot: "FIRST", assignedMethod: "AUTO" });
    await assignmentRepo.createAssignment(tx, { applicationId, reviewerId: secondId, slot: "SECOND", assignedMethod: "AUTO" });
  });

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.REVIEW_ASSIGNED,
    entityType: "Application",
    entityId: applicationId,
    metadata: { outcome: "ASSIGNED", reviewerIds: [firstId, secondId] },
  });

  return { assigned: true as const, reviewerIds: [firstId, secondId] };
}

// ---------------------------------------------------------------------------
// Manual assignment, accept, cancel, reassign (§10)
// ---------------------------------------------------------------------------

export async function manualAssignReviewer(actorId: string, input: ManualAssignReviewerInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.REVIEWS_ASSIGN);

  const programmeId = await getProgrammeIdForApplication(input.applicationId);

  const existingForSlot = await assignmentRepo.getActiveAssignmentForSlot(input.applicationId, input.slot as ReviewSlot);
  if (existingForSlot) throw new ConflictError(`This application already has an active ${input.slot} reviewer.`);

  const snapshot = await buildSingleCandidateSnapshot(input.applicationId, programmeId, input.reviewerId);
  const { eligible, excluded } = filterEligibleReviewers([snapshot], actor.id);
  if (eligible.length === 0) throwForExclusion(excluded[0]?.reason);

  const assignment = await prisma.$transaction((tx) =>
    assignmentRepo.createAssignment(tx, {
      applicationId: input.applicationId,
      reviewerId: input.reviewerId,
      slot: input.slot as ReviewSlot,
      assignedMethod: "MANUAL",
      assignedById: actor.id,
    }),
  );

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REVIEW_ASSIGNED,
    entityType: "Application",
    entityId: input.applicationId,
    metadata: { outcome: "ASSIGNED", method: "MANUAL", reviewerId: input.reviewerId, slot: input.slot },
  });

  return assignment;
}

/** A reviewer accepting their own assignment — no special permission beyond owning the row. */
export async function acceptAssignment(actorId: string, assignmentId: string) {
  const assignment = await assignmentRepo.getAssignment(assignmentId);
  if (!assignment) throw new NotFoundError("That assignment doesn't exist.");
  if (assignment.reviewerId !== actorId) {
    throw new AuthorisationError("This assignment belongs to a different reviewer.");
  }

  assertAssignmentTransition(assignment.status, "ACCEPTED");

  const updated = await assignmentRepo.updateAssignmentStatus(prisma, assignmentId, assignment.status, {
    status: "ACCEPTED",
    acceptedAt: new Date(),
  });
  if (updated.count === 0) throw new ReviewConcurrencyError();

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.ASSIGNMENT_ACCEPTED,
    entityType: "ReviewAssignment",
    entityId: assignmentId,
    metadata: {},
  });

  return assignmentRepo.getAssignment(assignmentId);
}

export async function cancelAssignment(actorId: string, input: CancelAssignmentInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ASSIGNMENTS_CANCEL);

  const assignment = await assignmentRepo.getAssignment(input.assignmentId);
  if (!assignment) throw new NotFoundError("That assignment doesn't exist.");

  assertAssignmentTransition(assignment.status, "CANCELLED");

  const updated = await assignmentRepo.updateAssignmentStatus(prisma, input.assignmentId, assignment.status, {
    status: "CANCELLED",
    cancelledAt: new Date(),
    cancelledById: actor.id,
    cancelReason: input.reason,
  });
  if (updated.count === 0) throw new ReviewConcurrencyError();

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ASSIGNMENT_CANCELLED,
    entityType: "ReviewAssignment",
    entityId: input.assignmentId,
    metadata: { reason: input.reason, priorStatus: assignment.status },
  });

  return assignmentRepo.getAssignment(input.assignmentId);
}

/**
 * §10: authorised users only, mandatory reason, full audit trail, no
 * silent overwrite. Preserves history by never mutating the old row's
 * reviewer — it moves to REASSIGNED and a brand-new row is created for
 * the new reviewer, linked via `reassignedFromId` (see schema.prisma's
 * doc comment on ReviewAssignment).
 */
export async function reassignAssignment(actorId: string, input: ReassignAssignmentInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.ASSIGNMENTS_REASSIGN);

  const assignment = await assignmentRepo.getAssignment(input.assignmentId);
  if (!assignment) throw new NotFoundError("That assignment doesn't exist.");
  if (input.newReviewerId === assignment.reviewerId) {
    throw new ConflictError("Choose a different reviewer to reassign to.");
  }

  assertAssignmentTransition(assignment.status, "REASSIGNED");

  const programmeId = await getProgrammeIdForApplication(assignment.applicationId);
  const snapshot = await buildSingleCandidateSnapshot(assignment.applicationId, programmeId, input.newReviewerId);
  const { eligible, excluded } = filterEligibleReviewers([snapshot], actor.id);
  if (eligible.length === 0) throwForExclusion(excluded[0]?.reason);

  const newAssignment = await prisma.$transaction(async (tx) => {
    const closed = await assignmentRepo.updateAssignmentStatus(tx, input.assignmentId, assignment.status, {
      status: "REASSIGNED",
      reassignedAt: new Date(),
      reassignedById: actor.id,
      reassignReason: input.reason,
    });
    if (closed.count === 0) throw new ReviewConcurrencyError();

    return assignmentRepo.createAssignment(tx, {
      applicationId: assignment.applicationId,
      reviewerId: input.newReviewerId,
      slot: assignment.slot,
      assignedMethod: "MANUAL",
      assignedById: actor.id,
      reassignedFromId: assignment.id,
    });
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ASSIGNMENT_REASSIGNED,
    entityType: "ReviewAssignment",
    entityId: newAssignment.id,
    metadata: {
      reason: input.reason,
      fromAssignmentId: assignment.id,
      fromReviewerId: assignment.reviewerId,
      toReviewerId: input.newReviewerId,
      slot: assignment.slot,
    },
  });

  return newAssignment;
}

// ---------------------------------------------------------------------------
// Conflict of interest (§7)
// ---------------------------------------------------------------------------

/**
 * Self-declaration (`actorId === input.reviewerId`, CONFLICTS_DECLARE) and
 * admin-recorded (anyone else, CONFLICTS_MANAGE) share one function —
 * only the required permission and the resulting `source` differ. This
 * excludes the reviewer from *future* assignment selection
 * (`buildCandidateSnapshots` reads this table); it does not retroactively
 * cancel an assignment that already exists, which is a distinct decision
 * left to a Programme Secretary via `cancelAssignment`/`reassignAssignment`
 * — see docs/BLIND_REVIEW.md.
 */
export async function declareConflictOfInterest(actorId: string, input: DeclareConflictOfInterestInput) {
  const actor = await requirePermission(
    actorId,
    actorId === input.reviewerId ? PERMISSIONS.CONFLICTS_DECLARE : PERMISSIONS.CONFLICTS_MANAGE,
  );

  const application = await prisma.application.findUnique({ where: { id: input.applicationId }, select: { id: true } });
  if (!application) throw new NotFoundError("That application doesn't exist.");

  const source: ConflictSource = actor.id === input.reviewerId ? "SELF_DECLARED" : "ADMIN_RECORDED";

  const conflict = await conflictRepo.createConflict({
    reviewerId: input.reviewerId,
    applicationId: input.applicationId,
    reason: input.reason,
    source,
    declaredById: actor.id,
    expiresAt: input.expiresAt ?? null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.CONFLICT_OF_INTEREST_DECLARED,
    entityType: "ReviewConflictOfInterest",
    entityId: conflict.id,
    metadata: { reviewerId: input.reviewerId, applicationId: input.applicationId, source, reason: input.reason },
  });

  return conflict;
}

// ---------------------------------------------------------------------------
// Reviewer capacity (§11)
// ---------------------------------------------------------------------------

export async function setReviewerCapacity(actorId: string, input: SetReviewerCapacityInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.REVIEWER_CAPACITY_MANAGE);

  const before = await capacityRepo.getCapacity(input.reviewerId, input.programmeId);

  const capacity = await capacityRepo.upsertCapacity(input.reviewerId, input.programmeId, {
    maxConcurrentAssignments: input.maxConcurrentAssignments,
    isAvailable: input.isAvailable,
    unavailableReason: input.unavailableReason ?? undefined,
    unavailableUntil: input.unavailableUntil ?? undefined,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REVIEWER_CAPACITY_CHANGED,
    entityType: "ReviewerCapacity",
    entityId: capacity.id,
    metadata: {
      reviewerId: input.reviewerId,
      programmeId: input.programmeId,
      before: before ? { maxConcurrentAssignments: before.maxConcurrentAssignments, isAvailable: before.isAvailable } : null,
      after: { maxConcurrentAssignments: capacity.maxConcurrentAssignments, isAvailable: capacity.isAvailable },
    },
  });

  return capacity;
}

// ---------------------------------------------------------------------------
// Third-review escalation engine (§9)
// ---------------------------------------------------------------------------

/**
 * Selects and assigns a THIRD reviewer for an already-created escalation.
 * Exported separately from `checkAndHandleEscalation` so a Programme
 * Secretary can retry it manually (§9's "select the next eligible
 * reviewer") when automatic selection found nobody eligible — see the
 * catch in `checkAndHandleEscalation`.
 */
export async function assignThirdReviewer(applicationId: string, escalationId: string, excludeReviewerIds: string[]) {
  const existingThird = await assignmentRepo.getActiveAssignmentForSlot(applicationId, "THIRD");
  if (existingThird) throw new ThirdReviewAlreadyExistsError();

  const programmeId = await getProgrammeIdForApplication(applicationId);

  const selection = await selectReviewers({
    applicationId,
    programmeId,
    count: 1,
    excludeReviewerIds,
    requestingActorId: null,
  });
  const thirdReviewerId = selection.selected[0];

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await assignmentRepo.createAssignment(tx, {
      applicationId,
      reviewerId: thirdReviewerId,
      slot: "THIRD",
      assignedMethod: "AUTO",
    });
    await escalationRepo.attachThirdReviewAssignment(tx, escalationId, created.id);
    return created;
  });

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.REVIEW_THIRD_REVIEWER_ASSIGNED,
    entityType: "Application",
    entityId: applicationId,
    metadata: { reviewerId: thirdReviewerId, escalationId },
  });

  return assignment;
}

/**
 * Compares Reviewer 1/Reviewer 2's submitted scores and either closes
 * both assignments out (no divergence) or escalates (§2, §9). Idempotent
 * via the escalation table's `@@unique([applicationId, firstReviewId,
 * secondReviewId])` — a second call for the same pair (e.g. a retried
 * webhook) is a no-op once the escalation row exists.
 */
async function checkAndHandleEscalation(applicationId: string) {
  const active = await assignmentRepo.listActiveAssignmentsForApplication(applicationId);
  const first = active.find((a) => a.slot === "FIRST");
  const second = active.find((a) => a.slot === "SECOND");
  if (!first || !second || first.status !== "SUBMITTED" || second.status !== "SUBMITTED") return;

  const [firstReview, secondReview] = await Promise.all([
    prisma.review.findUnique({ where: { reviewAssignmentId: first.id }, include: { reviewFramework: true } }),
    prisma.review.findUnique({ where: { reviewAssignmentId: second.id }, include: { reviewFramework: true } }),
  ]);
  if (!firstReview || !secondReview || firstReview.totalScore === null || secondReview.totalScore === null) return;

  const existing = await escalationRepo.getEscalationForPair(applicationId, firstReview.id, secondReview.id);
  if (existing) return;

  const maxPossible = firstReview.reviewFramework.totalConfiguredScore ?? secondReview.reviewFramework.totalConfiguredScore;
  if (!maxPossible) return;

  const divergence = calculateDivergencePercent(firstReview.totalScore, secondReview.totalScore, maxPossible);
  const threshold = await getNumericSetting(SETTINGS_KEYS.THIRD_REVIEW_DIVERGENCE_THRESHOLD_PERCENT);

  if (!exceedsDivergenceThreshold(divergence, threshold)) {
    await prisma.$transaction(async (tx) => {
      await assignmentRepo.updateAssignmentStatus(tx, first.id, "SUBMITTED", { status: "COMPLETED" });
      await assignmentRepo.updateAssignmentStatus(tx, second.id, "SUBMITTED", { status: "COMPLETED" });
    });
    return;
  }

  const escalation = await prisma.$transaction(async (tx) => {
    const created = await escalationRepo.createEscalation(tx, {
      applicationId,
      firstReviewId: firstReview.id,
      secondReviewId: secondReview.id,
      scoreDifference: divergence,
      thresholdApplied: new Prisma.Decimal(threshold),
    });
    await assignmentRepo.updateAssignmentStatus(tx, first.id, "SUBMITTED", { status: "ESCALATED" });
    await assignmentRepo.updateAssignmentStatus(tx, second.id, "SUBMITTED", { status: "ESCALATED" });
    return created;
  });

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.REVIEW_ESCALATION_TRIGGERED,
    entityType: "Application",
    entityId: applicationId,
    metadata: {
      outcome: "TRIGGERED",
      firstReviewId: firstReview.id,
      secondReviewId: secondReview.id,
      divergencePercent: divergence.toString(),
      thresholdApplied: threshold,
    },
  });

  // §9: a third reviewer must not know they're resolving a disagreement
  // unless programme policy explicitly requires it — V1.0 has no such
  // policy, so nothing about the THIRD assignment or its queries reveals
  // that context (see docs/THIRD_REVIEW_ENGINE.md).
  try {
    await assignThirdReviewer(applicationId, escalation.id, [first.reviewerId, second.reviewerId]);
  } catch (err) {
    if (err instanceof NoEligibleReviewersError) {
      // Escalation stays recorded with no third assignment yet; automatic
      // escalation must never block or fail the reviewer's own submission
      // — a Programme Secretary resolves it later via assignThirdReviewer.
      return;
    }
    throw err;
  }
}

/**
 * Resolves an escalation once its THIRD review submits (§2's formula:
 * average of the third reviewer's score and the lower of Reviewer 1/2).
 * A THIRD assignment with no linked escalation (created directly via
 * `manualAssignReviewer`, not through the engine) is left alone — there
 * is nothing to resolve.
 */
async function resolveEscalationForThirdReview(thirdAssignmentId: string, thirdReviewTotalScore: Prisma.Decimal) {
  const escalation = await escalationRepo.getEscalationByThirdAssignment(thirdAssignmentId);
  if (!escalation) return;

  const [firstReview, secondReview] = await Promise.all([
    prisma.review.findUniqueOrThrow({ where: { id: escalation.firstReviewId } }),
    prisma.review.findUniqueOrThrow({ where: { id: escalation.secondReviewId } }),
  ]);
  if (firstReview.totalScore === null || secondReview.totalScore === null) return;

  const finalScore = calculateFinalScoreAfterThirdReview(firstReview.totalScore, secondReview.totalScore, thirdReviewTotalScore);

  await prisma.$transaction(async (tx) => {
    await escalationRepo.resolveEscalation(tx, escalation.id, finalScore);
    await assignmentRepo.updateAssignmentStatus(tx, thirdAssignmentId, "SUBMITTED", { status: "COMPLETED" });
    await tx.reviewAssignment.updateMany({
      where: { id: { in: [firstReview.reviewAssignmentId, secondReview.reviewAssignmentId] }, status: "ESCALATED" },
      data: { status: "COMPLETED" },
    });
  });

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.REVIEW_ESCALATION_TRIGGERED,
    entityType: "ReviewEscalation",
    entityId: escalation.id,
    metadata: { outcome: "RESOLVED", finalScore: finalScore.toString() },
  });
}

/**
 * The one hook point called from reviewService.submitReview's success
 * path (Task 47) — refactored in as a follow-up call after the review's
 * own transaction commits, the same non-atomic "primary transaction, then
 * side-effect" sequencing Sequence 1 already established for
 * eligibility → autoAssignReviewers (modules/eligibility/domain or
 * engine calls it the same way). Syncs the assignment's own status to
 * SUBMITTED, then checks for third-review escalation (FIRST/SECOND) or
 * escalation resolution (THIRD).
 */
export async function onReviewSubmitted(reviewId: string) {
  const review = await prisma.review.findUniqueOrThrow({
    where: { id: reviewId },
    include: { reviewAssignment: true },
  });
  const assignment = review.reviewAssignment;

  await assignmentRepo.updateAssignmentStatus(prisma, assignment.id, assignment.status, { status: "SUBMITTED" });

  if (assignment.slot === "THIRD") {
    if (review.totalScore !== null) {
      await resolveEscalationForThirdReview(assignment.id, review.totalScore);
    }
  } else if (assignment.slot === "FIRST" || assignment.slot === "SECOND") {
    await checkAndHandleEscalation(review.applicationId);
  }

  // Release 1 Module 1 — keeps ApplicationScore.reviewAverage current
  // after every submission (a fresh non-escalated pair, a fresh
  // escalation, or a freshly resolved one). Idempotent and cheap: a
  // pure re-read-and-upsert, not a partial/incremental update.
  await recomputeReviewAverage(review.applicationId);
}

/**
 * Blind review enforcement (§8): a reviewer's own assignment list,
 * scoped server-side by `reviewerId = actorId` in the repository's
 * `where` clause (see assignmentRepository.listActiveAssignmentsForReviewer)
 * — never by filtering a broader result set after the fact. No permission
 * check beyond authentication: every Reviewer may see their own
 * assignments, and this can never return anyone else's.
 */
export async function listMyAssignments(actorId: string) {
  return assignmentRepo.listActiveAssignmentsForReviewer(actorId);
}

// ---------------------------------------------------------------------------
// Analytics (§11 — no dashboard UI, just the underlying queries)
// ---------------------------------------------------------------------------

export async function getAssignmentAnalytics(actorId: string, programmeId: string) {
  await requirePermission(actorId, PERMISSIONS.ASSIGNMENTS_VIEW);

  const [active, completed, escalationCount, capacities, submitted] = await Promise.all([
    prisma.reviewAssignment.count({
      where: { status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] }, application: { cohort: { programmeId } } },
    }),
    prisma.reviewAssignment.count({
      where: { status: "COMPLETED", application: { cohort: { programmeId } } },
    }),
    prisma.reviewEscalation.count({ where: { application: { cohort: { programmeId } } } }),
    capacityRepo.listCapacitiesForProgramme(programmeId),
    prisma.reviewAssignment.findMany({
      where: {
        status: { in: ["SUBMITTED", "ESCALATED", "COMPLETED"] },
        application: { cohort: { programmeId } },
      },
      select: { assignedAt: true, review: { select: { submittedAt: true } } },
    }),
  ]);

  const turnaroundsMs = submitted
    .filter((a): a is typeof a & { review: { submittedAt: Date } } => a.review?.submittedAt != null)
    .map((a) => a.review.submittedAt.getTime() - a.assignedAt.getTime());
  const avgTurnaroundHours = turnaroundsMs.length
    ? turnaroundsMs.reduce((sum, ms) => sum + ms, 0) / turnaroundsMs.length / (1000 * 60 * 60)
    : null;

  return {
    activeAssignments: active,
    completedAssignments: completed,
    escalationCount,
    thirdReviewFrequency: completed > 0 ? escalationCount / completed : 0,
    avgTurnaroundHours,
    reviewerCount: capacities.length,
    unavailableReviewerCount: capacities.filter((c) => !c.isAvailable).length,
  };
}
