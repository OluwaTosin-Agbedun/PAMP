import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * The 6 Panel Interview criteria from the "PAM-P 2026 Application Review
 * and Selection Metrics Framework" document (§8, "Stage Three: Panel
 * Interview Score — 40 marks"). `InterviewCriterion` has no
 * framework/version/publish lifecycle and no service layer at all
 * (cohort-scoped, flat — same shape as `InterviewQuestion`), so unlike
 * the Application Review side this seeds rows directly with no draft/
 * publish step to mirror.
 *
 * Same `maxScore = 5` / `weight = marks / 5` pattern as
 * `seedApplicationReviewCriteria.ts`, for the same reason: §8's own "Use
 * this formula: Rating ÷ 5 × allocated marks" is exactly what
 * `calculateCriterionScore` (rawScore × weight) computes, and
 * `Σ(maxScore × weight) = Σ(marks) = 40` matches the document's stated
 * panel interview total.
 */
const INTERVIEW_CRITERIA = [
  {
    label: "Ethical Judgement and Values",
    marks: 10,
    description: "Can the candidate think through difficult choices, accountability, service, and fairness?",
  },
  {
    label: "Leadership Maturity",
    marks: 8,
    description: "Does the candidate show self-awareness, discipline, resilience, humility, and responsibility?",
  },
  {
    label: "Pathway Readiness",
    marks: 8,
    description: "Does the candidate understand their selected pathway and have realistic next steps?",
  },
  {
    label: "Learning Agility and Coachability",
    marks: 6,
    description: "Is the candidate open to feedback, curious, teachable, and willing to grow?",
  },
  {
    label: "Communication and Presence",
    marks: 4,
    description: "Does the candidate communicate clearly, respectfully, and with composure?",
  },
  {
    label: "Programme Fit and Commitment",
    marks: 4,
    description: "Does the candidate understand the programme demands and represent the values of PAM-P?",
  },
] as const;

export type SeedInterviewCriteriaResult = {
  cohortId: string;
  created: number;
  totalConfiguredScore: string;
};

/**
 * Idempotently seeds the 6 Panel Interview criteria for a cohort. Safe
 * to run repeatedly: if any `InterviewCriterion` row already exists for
 * the cohort, this is a no-op (matching `seedApplicationReviewStage.ts`'s
 * "look up before create" idempotency, at the row-set level since there's
 * no single unique key to check here).
 */
export async function seedInterviewCriteria(
  db: Pick<PrismaClient, "interviewCriterion">,
  cohortId: string,
): Promise<SeedInterviewCriteriaResult> {
  const existing = await db.interviewCriterion.findMany({ where: { cohortId } });
  if (existing.length > 0) {
    const total = existing
      .filter((c) => c.isActive)
      .reduce((sum, c) => sum.plus(new Prisma.Decimal(c.maxScore).times(c.weight)), new Prisma.Decimal(0));
    return { cohortId, created: 0, totalConfiguredScore: total.toString() };
  }

  let total = new Prisma.Decimal(0);
  for (const [index, item] of INTERVIEW_CRITERIA.entries()) {
    const maxScore = new Prisma.Decimal(5);
    const weight = new Prisma.Decimal(item.marks).dividedBy(5);
    await db.interviewCriterion.create({
      data: {
        cohortId,
        label: item.label,
        description: item.description,
        maxScore,
        weight,
        order: index,
      },
    });
    total = total.plus(maxScore.times(weight));
  }

  return { cohortId, created: INTERVIEW_CRITERIA.length, totalConfiguredScore: total.toString() };
}
