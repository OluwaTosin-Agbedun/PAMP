import type { InterviewPathway, InterviewQuestionCategory } from "@/lib/generated/prisma/client";

/**
 * Addendum §3 / Interview Configuration §8 — pure question-selection
 * logic, no I/O. Mirrors the "pure calculation function" convention
 * interviewScoring.ts/scoringThreshold.ts already established.
 */

/**
 * `Application.pathway` is unconstrained free text (Excel/CSV import,
 * modules/import/validateRow.ts) — this module doesn't own that field
 * and doesn't change it. Matching happens here, at read time, against
 * the three canonical labels; an unrecognised or missing pathway simply
 * means no pathway questions display — never an error.
 */
const CANONICAL_PATHWAY_LABELS: Record<InterviewPathway, string> = {
  ENTREPRENEURSHIP_ENTERPRISE: "Entrepreneurship & Enterprise",
  PUBLIC_PRIVATE_SECTOR_LEADERSHIP: "Public & Private Sector Leadership",
  ACADEMIA_ADVANCED_STUDIES: "Academia & Advanced Studies",
};

export function matchApplicationPathway(pathwayText: string | null | undefined): InterviewPathway | null {
  if (!pathwayText) return null;
  const normalized = pathwayText.trim().toLowerCase();
  if (!normalized) return null;

  const match = (Object.entries(CANONICAL_PATHWAY_LABELS) as [InterviewPathway, string][]).find(
    ([, label]) => label.toLowerCase() === normalized,
  );
  return match ? match[0] : null;
}

export function pathwayLabel(pathway: InterviewPathway): string {
  return CANONICAL_PATHWAY_LABELS[pathway];
}

type QuestionLike = { id: string; category: InterviewQuestionCategory; pathway: InterviewPathway | null; isActive: boolean };

export const PATHWAY_QUESTION_COUNT = 2;
export const SITUATIONAL_QUESTION_COUNT = 1;

/**
 * A tiny seeded PRNG (mulberry32), keyed by the interview's own ID —
 * NOT cryptographic randomness, and not meant to be. This exists so the
 * *same* interview always resolves to the *same* random pathway/
 * situational picks no matter how many times `selectAutoAskedQuestions`
 * is called for it: the read-only workspace preview
 * (`getQuestionFrameworkForInterview`) and the actual recording call
 * (`startInterviewSession`) are two separate calls, and without a
 * stable seed they could pick two different sets of questions — the
 * preview a panellist saw before the interview started would then lie
 * about what actually got recorded.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates partial shuffle, stopping after `count` picks — never
 * mutates its input. `random` is injectable (defaults to `Math.random`)
 * so a caller without a stable seed still gets a sensible fallback, but
 * every real caller in this module passes a seeded generator instead —
 * see {@link seededRandom}.
 */
function pickRandom<T>(items: T[], count: number, random: () => number = Math.random): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const target = Math.min(count, pool.length);
  for (let i = 0; i < target; i++) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

/**
 * The full set of questions that get auto-recorded as asked when an
 * interview session starts:
 *
 * - Every active MANDATORY question (§3 — "every applicant... cannot be
 *   skipped").
 * - A random {@link PATHWAY_QUESTION_COUNT} of the active PATHWAY
 *   questions matching the application's pathway (Interview
 *   Configuration §8B — "randomly presents 2 questions... matched to
 *   the candidate's selected pathway"). Previously this selected *every*
 *   matching question, not a random subset — corrected here.
 * - A random {@link SITUATIONAL_QUESTION_COUNT} of the active
 *   SITUATIONAL questions, not pathway-filtered (§8C — "randomly
 *   selects 1 question from the approved scenario bank, to assess
 *   judgement under pressure").
 *
 * ADDITIONAL_BANK questions are never included here — those are only
 * ever explicitly, individually picked by a panellist during the
 * session (capped at one per panellist, enforced in
 * interviewQuestionService.ts).
 */
export function selectAutoAskedQuestions<T extends QuestionLike>(
  questions: T[],
  applicationPathway: InterviewPathway | null,
  random?: () => number,
): T[] {
  const active = questions.filter((q) => q.isActive);

  const mandatory = active.filter((q) => q.category === "MANDATORY");
  const pathwayMatches = active.filter((q) => q.category === "PATHWAY" && q.pathway !== null && q.pathway === applicationPathway);
  const situational = active.filter((q) => q.category === "SITUATIONAL");

  return [
    ...mandatory,
    ...pickRandom(pathwayMatches, PATHWAY_QUESTION_COUNT, random),
    ...pickRandom(situational, SITUATIONAL_QUESTION_COUNT, random),
  ];
}
