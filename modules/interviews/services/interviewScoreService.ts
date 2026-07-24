import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import {
  AuthorisationError,
  ConflictError,
  IncompleteReviewError,
  InsufficientSubmissionsError,
  InterviewScoringClosedError,
  InvalidScoreError,
  NotFoundError,
  ReviewAlreadySubmittedError,
  ReviewConcurrencyError,
  ReviewPeriodClosedError,
} from "@/lib/errors";
import { requirePermission } from "@/lib/permissions/service";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { recomputeInterviewAverage } from "@/modules/scoring/services/scoreAggregationService";

import { assertScoreTransition } from "../domain/scoreLifecycle";
import { calculateInterviewTotal, getInterviewScoreBreakdown } from "../domain/interviewScoring";
import { validateInterviewScores } from "../domain/interviewScoreValidation";
import { evaluateSubmissionThreshold, isScoringThresholdMet } from "../domain/scoringThreshold";
import { getQuestionFrameworkForInterview } from "./interviewQuestionService";
import * as interviewRepo from "../repositories/interviewRepository";
import * as panelistRepo from "../repositories/panelistRepository";
import * as questionRepo from "../repositories/interviewQuestionRepository";
import * as scoreRepo from "../repositories/interviewScoreRepository";
import type {
  CloseInterviewWithOverrideInput,
  SaveDraftInterviewScoresInput,
  SubmitInterviewScoreInput,
} from "../validation/schemas";

/**
 * Interview score lifecycle orchestration for one panellist's own score
 * — ownership checks, permission checks, status transitions (via
 * domain/scoreLifecycle.ts), validation (via domain/interviewScoreValidation.ts),
 * transactions, and audit logging. Mirrors
 * modules/reviews/services/reviewService.ts's shape and sequencing.
 *
 * "Scores remain hidden until all four have submitted" (Module 2 brief)
 * is enforced structurally, not by a visibility flag: every function
 * here takes the *caller's own* interviewId/panelistId pairing — nothing
 * accepts another panellist's id as an argument, so there is no code
 * path that could ever return another panellist's score. The one piece
 * of cross-panellist information exposed is a non-numeric progress
 * count ("2 of 4 submitted") — see `getInterviewWorkspaceView` — which
 * cannot leak a score. A "compare all panellists' scores once complete"
 * screen is Module 6's "Compare scores" capability, not this module's.
 */

async function assertActivePanelist(interviewId: string, userId: string) {
  const rows = await panelistRepo.getActivePanelistsForUserIds(interviewId, [userId]);
  if (rows.length === 0) {
    throw new AuthorisationError("You are not an active panellist on this interview.");
  }
}

async function loadScoreOrThrow(interviewScoreId: string) {
  const score = await scoreRepo.getScore(interviewScoreId);
  if (!score) throw new NotFoundError("That interview score doesn't exist.");
  return score;
}

function assertOwnership(score: { panelistId: string }, actorId: string) {
  if (score.panelistId !== actorId) {
    throw new AuthorisationError("This score belongs to a different panellist.");
  }
}

async function isInterviewWindowOpen(programmeId: string, cohortId: string, now: Date): Promise<boolean> {
  const window = await prisma.programmeWindow.findFirst({
    where: { programmeId, OR: [{ cohortId }, { cohortId: null }], code: "INTERVIEW" },
  });
  if (!window) return true;
  if (window.opensAt && now < window.opensAt) return false;
  if (window.closesAt && now > window.closesAt) return false;
  return true;
}

/** Idempotent: returns the panellist's existing score row, or creates one on first visit. */
export async function getOrCreateInterviewScore(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEWS_SCORE);
  await assertActivePanelist(interviewId, actorId);

  const existing = await scoreRepo.getScoreByInterviewAndPanelist(interviewId, actorId);
  if (existing) return existing;

  return scoreRepo.createScore({ interviewId, panelistId: actorId });
}

/**
 * Everything the scoring page needs in one call: the interview,
 * applicant summary, active question framework, the caller's own score
 * (created if this is their first visit), and a non-numeric submission
 * progress signal across the panel.
 *
 * Addendum §2.4 extension: once the submission threshold is met (every
 * active panellist submitted, or a Secretariat override), the caller
 * additionally gets the final averaged score — and only that single
 * number, never another panellist's score or comments, matching the
 * "own data only" structural enforcement this function's doc comment
 * already describes for `submittedCount`.
 */
export async function getInterviewWorkspaceView(actorId: string, interviewId: string) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { application: { include: { applicant: true } } },
  });
  if (!interview) throw new NotFoundError("That interview doesn't exist.");

  const score = await getOrCreateInterviewScore(actorId, interviewId);
  const criteria = await scoreRepo.listActiveCriteriaForCohort(interview.cohortId);

  const [activePanelists, allScores] = await Promise.all([
    panelistRepo.listActivePanelistsForInterview(interviewId),
    scoreRepo.listScoresForInterview(interviewId),
  ]);
  const threshold = evaluateSubmissionThreshold(
    activePanelists.map((p) => p.userId),
    allScores,
  );
  const scoringClosed = interview.scoringOverrideAt !== null;
  const thresholdMet = isScoringThresholdMet(threshold, interview.scoringOverrideAt);

  const applicationScore = thresholdMet
    ? await prisma.applicationScore.findUnique({
        where: { applicationId: interview.applicationId },
        select: { interviewAverage: true },
      })
    : null;

  const questionFramework = await getQuestionFrameworkForInterview(interviewId, interview.application.pathway);

  return {
    interview,
    score,
    criteria,
    totalPanelists: activePanelists.length,
    submittedCount: threshold.submittedCount,
    scoringClosed,
    interviewAverage: applicationScore?.interviewAverage ?? null,
    questionFramework,
  };
}

export async function saveDraftInterviewScores(actorId: string, input: SaveDraftInterviewScoresInput) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEWS_SCORE);

  const score = await loadScoreOrThrow(input.interviewScoreId);
  assertOwnership(score, actorId);

  if (score.status === "SUBMITTED") throw new ReviewAlreadySubmittedError("This interview score has already been submitted.");
  if (score.status === "RECUSED") throw new ConflictError("This interview score is no longer active.");

  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: score.interviewId } });
  if (interview.scoringOverrideAt) throw new InterviewScoringClosedError();

  const criteria = await scoreRepo.listActiveCriteriaForCohort(interview.cohortId);

  const result = validateInterviewScores(criteria, input.scores, { mode: "draft" });
  if (!result.valid) {
    throw new InvalidScoreError(result.issues.map((i) => i.message).join(" "));
  }

  await prisma.$transaction(async (tx) => {
    for (const entry of result.entries) {
      await scoreRepo.upsertEntry(tx, score.id, entry.criterionId, entry.score);
    }

    const allEntries = await tx.interviewScoreEntry.findMany({ where: { interviewScoreId: score.id } });
    const total = calculateInterviewTotal(allEntries, criteria);

    const updated = await scoreRepo.updateScoreStatus(tx, score.id, score.status, { totalScore: total });
    if (updated.count === 0) throw new ReviewConcurrencyError("This interview score changed elsewhere — refresh and try again.");
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_DRAFT_SCORE_SAVED,
    entityType: "InterviewScore",
    entityId: score.id,
    metadata: { criteriaScored: result.entries.length },
  });

  return getInterviewScoreBreakdownFor(score.id);
}

/**
 * Transactional: either every score entry is written and the score
 * flips to SUBMITTED, or nothing changes — the status-conditioned
 * update is what makes a double submission fail cleanly.
 */
export async function submitInterviewScore(actorId: string, input: SubmitInterviewScoreInput) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEWS_SCORE);

  const score = await loadScoreOrThrow(input.interviewScoreId);
  assertOwnership(score, actorId);

  if (score.status === "SUBMITTED") throw new ReviewAlreadySubmittedError("This interview score has already been submitted.");
  assertScoreTransition(score.status, "SUBMITTED");

  const interview = await prisma.interview.findUniqueOrThrow({
    where: { id: score.interviewId },
    include: { application: { select: { cohort: { select: { programmeId: true } } } } },
  });
  if (interview.scoringOverrideAt) throw new InterviewScoringClosedError();

  const now = new Date();
  const windowOpen = await isInterviewWindowOpen(interview.application.cohort.programmeId, interview.cohortId, now);
  if (!windowOpen) throw new ReviewPeriodClosedError("The interview period is not currently open.");

  const criteria = await scoreRepo.listActiveCriteriaForCohort(interview.cohortId);
  const result = validateInterviewScores(criteria, input.scores, { mode: "submit" });
  if (!result.valid) {
    const message = result.issues.map((i) => i.message).join(" ");
    const onlyMissing = result.issues.every((i) => i.code === "NO_SCORES_ENTERED");
    if (onlyMissing) throw new IncompleteReviewError(message);
    throw new InvalidScoreError(message);
  }

  const total = calculateInterviewTotal(result.entries, criteria);

  await prisma.$transaction(async (tx) => {
    for (const entry of result.entries) {
      await scoreRepo.upsertEntry(tx, score.id, entry.criterionId, entry.score);
    }

    const updated = await scoreRepo.updateScoreStatus(tx, score.id, score.status, {
      status: "SUBMITTED",
      totalScore: total,
      overallAssessment: input.overallAssessment ?? null,
      strengths: input.strengths ?? null,
      concerns: input.concerns ?? null,
      recommendation: input.recommendation ?? null,
      integrityFlag: input.integrityFlag ?? false,
      submittedAt: now,
    });
    if (updated.count === 0) throw new ReviewConcurrencyError("This interview score changed elsewhere — refresh and try again.");
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_SCORE_SUBMITTED,
    entityType: "InterviewScore",
    entityId: score.id,
    metadata: { total: total.toString(), interviewId: score.interviewId },
  });

  // Addendum §2.7 — keeps ApplicationScore.interviewAverage current after
  // every submission, same "idempotent, cheap re-read-and-upsert" pattern
  // as recomputeReviewAverage's own call site (assignmentService.ts).
  // Stays null below 3 valid submissions; visibility to panellists is
  // gated separately (getInterviewWorkspaceView / isScoringThresholdMet).
  await recomputeInterviewAverage(interview.applicationId);

  return getInterviewScoreBreakdownFor(score.id);
}

async function getInterviewScoreBreakdownFor(interviewScoreId: string) {
  const score = await loadScoreOrThrow(interviewScoreId);
  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: score.interviewId } });
  const criteria = await scoreRepo.listActiveCriteriaForCohort(interview.cohortId);
  const entries = score.entries.map((e) => ({ criterionId: e.criterionId, score: e.score }));
  return getInterviewScoreBreakdown(entries, criteria);
}

export async function getInterviewScoreBreakdownForActor(actorId: string, interviewScoreId: string) {
  const score = await loadScoreOrThrow(interviewScoreId);
  assertOwnership(score, actorId);
  return getInterviewScoreBreakdownFor(interviewScoreId);
}

/**
 * Addendum §2.6 — "Close Interview with Three Valid Scores." Secretariat-
 * only: requires exactly one active panellist missing (at least three
 * valid submissions), records the missing panellist automatically
 * (derived server-side, never client-supplied — avoids a TOCTOU where a
 * client-supplied id doesn't match the panel's actual state), audits the
 * mandatory reason, and closes the interview to further score mutation.
 */
export async function closeInterviewWithOverride(actorId: string, input: CloseInterviewWithOverrideInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCORING_CLOSE_OVERRIDE);

  const interview = await interviewRepo.getInterviewForOverride(input.interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.scoringOverrideAt) throw new InterviewScoringClosedError("This interview's scoring is already closed.");

  const [activePanelists, allScores] = await Promise.all([
    panelistRepo.listActivePanelistsForInterview(interview.id),
    scoreRepo.listScoresForInterview(interview.id),
  ]);
  const threshold = evaluateSubmissionThreshold(
    activePanelists.map((p) => p.userId),
    allScores,
  );
  if (threshold.status !== "OVERRIDE_ELIGIBLE") {
    throw new InsufficientSubmissionsError(
      `Cannot close this interview: ${threshold.submittedCount} of ${threshold.activeCount} panellists have submitted (need exactly one missing, at least three valid).`,
    );
  }

  const now = new Date();
  const updated = await interviewRepo.applyScoringOverride(interview.id, {
    scoringOverrideAt: now,
    scoringOverrideById: actor.id,
    scoringOverrideReason: input.reason,
    scoringOverrideMissingPanelistId: threshold.missingPanelistId!,
  });
  if (updated.count === 0) throw new ReviewConcurrencyError("This interview changed elsewhere — refresh and try again.");

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_SCORING_CLOSED_WITH_OVERRIDE,
    entityType: "Interview",
    entityId: interview.id,
    metadata: { reason: input.reason, missingPanelistId: threshold.missingPanelistId, submittedCount: threshold.submittedCount },
  });

  await recomputeInterviewAverage(interview.applicationId);
}

/**
 * Addendum §2.4 — Secretariat (and, once their own modules exist,
 * Committee/Executive) full visibility into every panellist's scores and
 * comments for one interview, plus the average. Distinct from
 * `getInterviewWorkspaceView`, which structurally only ever returns the
 * caller's own score.
 */
export async function getInterviewScoreOverviewForSecretariat(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCORES_VIEW_ALL);

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { application: { include: { applicant: true } } },
  });
  if (!interview) throw new NotFoundError("That interview doesn't exist.");

  const [scores, applicationScore, activePanelists] = await Promise.all([
    scoreRepo.listScoresForInterviewWithPanelist(interviewId),
    prisma.applicationScore.findUnique({ where: { applicationId: interview.applicationId } }),
    panelistRepo.listActivePanelistsForInterview(interviewId),
  ]);

  const threshold = evaluateSubmissionThreshold(
    activePanelists.map((p) => p.userId),
    scores,
  );

  const askedQuestions = await questionRepo.listAskedForInterview(interviewId);

  return { interview, scores, applicationScore, activePanelists, threshold, askedQuestions };
}
