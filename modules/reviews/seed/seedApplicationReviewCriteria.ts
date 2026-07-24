import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

import { validateFrameworkForPublish } from "../domain/frameworkValidation";

/**
 * The 6 criteria and rating scale from the "PAM-P 2026 Application Review
 * Guidelines and Scoring" document (§3 rating scale, §4 scoring areas) —
 * the document `seedApplicationReviewStage.ts` explicitly said didn't
 * exist in this repository yet. `code` is this seed's own stable
 * identifier, not from the source document (which has none).
 *
 * Each criterion is seeded with `maxScore = 5` (the 0-5 rating a reviewer
 * enters, per §3) and `weight = marks / 5`, so that
 * `Σ(maxScore × weight) = Σ(marks) = 60` — satisfying
 * `validateFrameworkForPublish`'s exact-match check against the stage's
 * maxTotalScore — and so that `rating ÷ 5 × marks` (§5's formula) is
 * exactly what `calculateCriterionScore` (rawScore × weight) computes.
 */
const APPLICATION_REVIEW_CRITERIA = [
  {
    code: "LEADERSHIP_POTENTIAL",
    label: "Leadership Potential",
    marks: 12,
    reviewerGuidance: "Responsibility, initiative, influence, service, enterprise, community engagement or problem-solving.",
    evidenceGuidance: "CV, personal statement, motivation.",
  },
  {
    code: "ETHICAL_ORIENTATION",
    label: "Ethical Orientation and Judgement",
    marks: 10,
    reviewerGuidance: "Integrity, accountability, fairness, discipline, respect for process and service mindset.",
    evidenceGuidance: "Personal statement, motivation, CV.",
  },
  {
    code: "PURPOSE_MOTIVATION",
    label: "Purpose and Motivation",
    marks: 10,
    reviewerGuidance: "Clear reason for applying, seriousness of intent, self-awareness and connection to leadership growth.",
    evidenceGuidance: "Motivation, personal statement.",
  },
  {
    code: "PATHWAY_ALIGNMENT",
    label: "Pathway Alignment",
    marks: 12,
    reviewerGuidance: "Strong fit with one selected pathway and evidence that PAM-P can support the applicant's next stage.",
    evidenceGuidance: "Selected pathway, CV, written responses.",
  },
  {
    code: "COMMUNICATION_THOUGHT",
    label: "Communication and Quality of Thought",
    marks: 8,
    reviewerGuidance: "Clarity, coherence, originality, structure, maturity and authenticity.",
    evidenceGuidance: "Personal statement, motivation.",
  },
  {
    code: "COMMITMENT_READINESS",
    label: "Commitment and Readiness",
    marks: 8,
    reviewerGuidance:
      "Availability and willingness to complete the online academy, residential phase, assignments and mentorship engagement.",
    evidenceGuidance: "Motivation, declarations, CV timeline.",
  },
] as const;

/** §3's rating scale — the "Reviewer Standard" column becomes each band's behavioral anchor. */
const RATING_SCALE_BANDS = [
  { value: 5, label: "Exceptional", behavioralAnchor: "Clear, specific, well-evidenced and above the expected standard." },
  { value: 4, label: "Strong", behavioralAnchor: "Good evidence, clear reasoning and strong fit with the programme." },
  { value: 3, label: "Acceptable", behavioralAnchor: "Meets the basic standard, but may lack depth, distinction or precision." },
  { value: 2, label: "Weak", behavioralAnchor: "Limited evidence, unclear reasoning or weak alignment with PAM-P." },
  { value: 1, label: "Very Weak", behavioralAnchor: "Minimal relevant evidence or doubtful seriousness." },
  { value: 0, label: "No Evidence", behavioralAnchor: "No relevant evidence provided for the area being scored." },
] as const;

export type SeedApplicationReviewCriteriaResult = {
  frameworkId: string;
  created: boolean;
  totalConfiguredScore: string;
};

/**
 * Idempotently seeds and publishes the Application Review framework's
 * criteria and rating scale onto the stage `seedApplicationReviewStage`
 * already created. Deliberately talks to Prisma directly rather than
 * going through `modules/reviews/services/frameworkService.ts` — that
 * service (and the repository layer beneath it) is guarded with
 * `import "server-only"`, which cannot resolve when this runs from
 * `prisma/seed.ts` as a plain `tsx` script outside Next's bundler (the
 * same reason `seedApplicationReviewStage.ts` bypasses the service
 * layer). `validateFrameworkForPublish` has no such guard — it's pure
 * domain logic — so it's reused as-is rather than reimplemented, keeping
 * this seed honest against the exact rule the real publish flow enforces.
 *
 * Safe to run repeatedly: if a PUBLISHED framework already exists for
 * the stage, this is a no-op.
 */
export async function seedApplicationReviewCriteria(
  db: Pick<PrismaClient, "reviewStage" | "reviewFramework" | "ratingScale" | "reviewCriterion">,
  stageId: string,
  publishedById: string,
): Promise<SeedApplicationReviewCriteriaResult> {
  const existingPublished = await db.reviewFramework.findFirst({
    where: { reviewStageId: stageId, status: "PUBLISHED" },
  });
  if (existingPublished) {
    return {
      frameworkId: existingPublished.id,
      created: false,
      totalConfiguredScore: existingPublished.totalConfiguredScore?.toString() ?? "",
    };
  }

  const stage = await db.reviewStage.findUniqueOrThrow({ where: { id: stageId } });

  const latest = await db.reviewFramework.findFirst({
    where: { reviewStageId: stageId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const framework = await db.reviewFramework.create({
    data: { reviewStageId: stage.id, programmeId: stage.programmeId, cohortId: stage.cohortId, version },
  });

  const ratingScale = await db.ratingScale.create({
    data: {
      reviewFrameworkId: framework.id,
      name: "PAM-P Application Review Rating Scale",
      description: "The 0-5 rating scale from the PAM-P 2026 Application Review Guidelines and Scoring document, §3.",
      bands: {
        create: RATING_SCALE_BANDS.map((band, index) => ({
          value: new Prisma.Decimal(band.value),
          label: band.label,
          behavioralAnchor: band.behavioralAnchor,
          displayOrder: index,
        })),
      },
    },
    include: { bands: true },
  });

  const criteria = [];
  for (const [index, item] of APPLICATION_REVIEW_CRITERIA.entries()) {
    const criterion = await db.reviewCriterion.create({
      data: {
        reviewFrameworkId: framework.id,
        code: item.code,
        label: item.label,
        reviewerGuidance: item.reviewerGuidance,
        evidenceGuidance: item.evidenceGuidance,
        displayOrder: index,
        minScore: new Prisma.Decimal(0),
        maxScore: new Prisma.Decimal(5),
        weight: new Prisma.Decimal(item.marks).dividedBy(5),
        isMandatory: true,
        ratingScaleId: ratingScale.id,
      },
    });
    criteria.push(criterion);
  }

  const result = validateFrameworkForPublish(framework, stage, criteria, [ratingScale]);
  if (!result.valid) {
    throw new Error(
      `Seed data for the Application Review framework failed publish validation: ${result.issues.map((i) => i.message).join(" ")}`,
    );
  }

  const now = new Date();
  await db.reviewFramework.update({
    where: { id: framework.id },
    data: { status: "PUBLISHED", totalConfiguredScore: result.totalConfiguredScore, publishedById, publishedAt: now },
  });
  await db.reviewStage.updateMany({ where: { id: stage.id, status: { not: "ACTIVE" } }, data: { status: "ACTIVE" } });

  return { frameworkId: framework.id, created: true, totalConfiguredScore: result.totalConfiguredScore.toString() };
}
