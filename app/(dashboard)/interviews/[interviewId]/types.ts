/**
 * Plain, JSON-serializable view models for the interview scoring UI —
 * Prisma `Decimal` values are never passed across the Server → Client
 * boundary, so page.tsx converts every Decimal field to a string before
 * handing data to a Client Component. Mirrors
 * app/(dashboard)/reviews/[assignmentId]/types.ts's shape, narrowed to
 * what InterviewCriterion actually has (see modules/interviews/types/
 * scoring.ts for why it's flatter than the review side's).
 */

export type CriterionViewModel = {
  id: string;
  label: string;
  description: string | null;
  maxScore: string;
  weight: string;
  order: number;
};

export type ScoreViewModel = {
  criterionId: string;
  score: string;
};

/** PAM-P 2026 Interview Score Sheet — the closed recommendation choice. */
export type InterviewRecommendationViewModel =
  | "STRONGLY_RECOMMEND"
  | "RECOMMEND"
  | "RESERVE"
  | "NOT_RECOMMENDED"
  | "INTEGRITY_HOLD";

/**
 * Addendum §2.3's three free-text fields, plus the Score Sheet's closed
 * recommendation choice and integrity flag — bundled together since they
 * all come from the same "Panel comments" section of the scoring form.
 */
export type InterviewCommentsViewModel = {
  overallAssessment: string | null;
  strengths: string | null;
  concerns: string | null;
  recommendation: InterviewRecommendationViewModel | null;
  integrityFlag: boolean;
};

export type ApplicantSummaryViewModel = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  gender: string | null;
  institution: string | null;
  stateOfOrigin: string | null;
};

/** Addendum Module 3 — the interview's question framework. */
export type InterviewQuestionViewModel = {
  id: string;
  text: string;
  category: "MANDATORY" | "PATHWAY" | "SITUATIONAL" | "ADDITIONAL_BANK";
};

export type AskedQuestionViewModel = {
  id: string;
  questionId: string;
  text: string;
  category: "MANDATORY" | "PATHWAY" | "SITUATIONAL" | "ADDITIONAL_BANK";
  askedByName: string;
  askedAt: string;
};

export type QuestionFrameworkViewModel = {
  actualStartedAt: string | null;
  actualEndedAt: string | null;
  /** Mandatory + matched-pathway questions — auto-recorded once the session starts. */
  autoAsked: InterviewQuestionViewModel[];
  /** Active bank questions not yet asked in this interview. */
  availableAdditional: InterviewQuestionViewModel[];
  asked: AskedQuestionViewModel[];
};
