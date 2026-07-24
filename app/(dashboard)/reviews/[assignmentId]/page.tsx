import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthorisationError, FrameworkNotPublishedError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { getReviewScoreBreakdown } from "@/modules/reviews/domain/scoring";
import { createReview } from "@/modules/reviews/services/reviewService";
import type { CriterionWithScale, ValidatedScoreEntry } from "@/modules/reviews/types/scoring";

import { ReviewSummary } from "./review-summary";
import { ScoringForm } from "./scoring-form";
import type { CriterionViewModel, ScoreViewModel } from "./types";

export const metadata: Metadata = {
  title: "Score application — PAM-P FMS",
};

const LOCKED_STATUSES = new Set(["SUBMITTED", "RECUSED", "CANCELLED"]);

function toCriterionViewModel(criterion: CriterionWithScale): CriterionViewModel {
  return {
    id: criterion.id,
    code: criterion.code,
    label: criterion.label,
    description: criterion.description,
    reviewerGuidance: criterion.reviewerGuidance,
    evidenceGuidance: criterion.evidenceGuidance,
    displayOrder: criterion.displayOrder,
    minScore: criterion.minScore.toString(),
    maxScore: criterion.maxScore.toString(),
    weight: criterion.weight.toString(),
    isMandatory: criterion.isMandatory,
    isCommentMandatory: criterion.isCommentMandatory,
    allowDecimalScores: criterion.allowDecimalScores,
    isActive: criterion.isActive,
    ratingScale: criterion.ratingScale
      ? {
          bands: criterion.ratingScale.bands
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((band) => ({
              value: band.value.toString(),
              label: band.label,
              description: band.description,
              behavioralAnchor: band.behavioralAnchor,
            })),
        }
      : null,
  };
}

export default async function ScoringPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const user = await requirePagePermission(PERMISSIONS.REVIEWS_PERFORM);
  const { assignmentId } = await params;

  let review;
  try {
    review = await createReview(user.id, assignmentId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof AuthorisationError) {
      notFound();
    }
    if (error instanceof FrameworkNotPublishedError) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Review framework not available yet</CardTitle>
            <CardDescription>
              No review framework has been published for this stage yet. Check back once a Programme
              Director publishes one — your assignment is safely recorded either way.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }
    throw error;
  }

  const criteria = (review.reviewFramework.criteria as CriterionWithScale[])
    .filter((c) => c.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const criteriaViewModels: CriterionViewModel[] = criteria.map(toCriterionViewModel);

  const applicantName = `${review.application.applicant.firstName} ${review.application.applicant.lastName}`;
  const stage = review.reviewFramework.reviewStage;

  if (LOCKED_STATUSES.has(review.status)) {
    const entries: ValidatedScoreEntry[] = review.scores.map((s) => ({
      criterionId: s.criterionId,
      score: s.score,
      comment: s.comment,
    }));
    const breakdown = getReviewScoreBreakdown(entries, criteria, review.reviewFramework.scoringMethod);

    return (
      <ReviewSummary
        applicantName={applicantName}
        status={review.status}
        comments={review.comments}
        submittedAt={review.submittedAt ? review.submittedAt.toISOString() : null}
        total={breakdown.total.toString()}
        maxPossible={breakdown.maxPossible.toString()}
        criteria={criteriaViewModels}
        breakdown={breakdown.criteria.map((c) => ({
          criterionId: c.criterionId,
          rawScore: c.rawScore ? c.rawScore.toString() : null,
          comment: c.comment,
        }))}
      />
    );
  }

  const scoreViewModels: ScoreViewModel[] = review.scores.map((s) => ({
    criterionId: s.criterionId,
    score: s.score.toString(),
    comment: s.comment,
  }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{applicantName}</h1>
          <p className="text-muted-foreground text-sm">{stage.name}</p>
        </div>
        <Badge variant={review.status === "REOPENED" ? "secondary" : "outline"}>
          {review.status === "REOPENED" ? "Reopened — please resubmit" : "In progress"}
        </Badge>
      </div>

      <ScoringForm
        reviewId={review.id}
        criteria={criteriaViewModels}
        initialScores={scoreViewModels}
        initialComments={review.comments}
        commentsRequired={stage.commentsRequired}
        allCriteriaMandatory={stage.allCriteriaMandatory}
      />
    </div>
  );
}
