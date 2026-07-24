import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthorisationError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getInterviewScoreBreakdownForActor, getInterviewWorkspaceView } from "@/modules/interviews/services/interviewScoreService";
import { getTeamsMeetingForInterview } from "@/modules/interviews/services/teamsMeetingService";

import { InterviewQuestionsPanel } from "./interview-questions-panel";
import { InterviewSummary } from "./interview-summary";
import { InterviewScoringForm } from "./scoring-form";
import type {
  ApplicantSummaryViewModel,
  CriterionViewModel,
  InterviewCommentsViewModel,
  QuestionFrameworkViewModel,
  ScoreViewModel,
} from "./types";

export const metadata: Metadata = {
  title: "Score interview — PAM-P FMS",
};

const LOCKED_STATUSES = new Set(["SUBMITTED", "RECUSED"]);

export default async function InterviewScoringPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const user = await requirePagePermission(PERMISSIONS.INTERVIEWS_SCORE);
  const { interviewId } = await params;

  let view;
  try {
    view = await getInterviewWorkspaceView(user.id, interviewId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof AuthorisationError) {
      notFound();
    }
    throw error;
  }

  const { interview, score, criteria, totalPanelists, submittedCount, scoringClosed, interviewAverage, questionFramework } = view;

  // Microsoft Teams Interview Integration — prefer the Graph-synced join
  // link over the manual fallback (`teamsLink`) over the legacy
  // `meetingLink` field, so a panellist always sees the best available
  // link, never a stale one left over from before a real meeting synced.
  const canViewTeamsLink = permissionsForRole(user.role).includes(PERMISSIONS.INTERVIEW_TEAMS_LINK_VIEW);
  const teamsMeeting = canViewTeamsLink ? await getTeamsMeetingForInterview(user.id, interviewId) : null;
  const joinLink = teamsMeeting?.syncStatus === "SYNCED" && teamsMeeting.joinUrl ? teamsMeeting.joinUrl : (interview.teamsLink ?? interview.meetingLink);
  const commentsViewModel: InterviewCommentsViewModel = {
    overallAssessment: score.overallAssessment,
    strengths: score.strengths,
    concerns: score.concerns,
    recommendation: score.recommendation,
    integrityFlag: score.integrityFlag,
  };
  const questionFrameworkViewModel: QuestionFrameworkViewModel = {
    actualStartedAt: interview.actualStartedAt ? interview.actualStartedAt.toISOString() : null,
    actualEndedAt: interview.actualEndedAt ? interview.actualEndedAt.toISOString() : null,
    autoAsked: questionFramework.autoAsked.map((q) => ({ id: q.id, text: q.text, category: q.category })),
    availableAdditional: questionFramework.availableAdditional.map((q) => ({ id: q.id, text: q.text, category: q.category })),
    asked: questionFramework.asked.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      text: a.question.text,
      category: a.question.category,
      askedByName: a.askedByPanelist.name,
      askedAt: a.askedAt.toISOString(),
    })),
  };
  const applicant = interview.application.applicant;
  const applicantName = `${applicant.firstName} ${applicant.lastName}`;

  const criteriaViewModels: CriterionViewModel[] = criteria.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    maxScore: c.maxScore.toString(),
    weight: c.weight.toString(),
    order: c.order,
  }));

  const applicantSummary: ApplicantSummaryViewModel = {
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    email: applicant.email,
    phone: applicant.phone,
    gender: applicant.gender,
    institution: applicant.institution,
    stateOfOrigin: applicant.stateOfOrigin,
  };

  const header = (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/interviews" className="text-muted-foreground text-sm hover:underline">
          ← Back to Interview Workspace
        </Link>
        <Badge variant="outline">
          {interview.scheduledAt ? new Date(interview.scheduledAt).toLocaleString("en-GB") : "Not yet scheduled"} · {interview.durationMinutes} min
        </Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Applicant summary</CardTitle>
          <CardDescription>{applicantSummary.email}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Name:</span> {applicantSummary.firstName} {applicantSummary.lastName}
          </p>
          {applicantSummary.phone && (
            <p>
              <span className="text-muted-foreground">Phone:</span> {applicantSummary.phone}
            </p>
          )}
          {applicantSummary.institution && (
            <p>
              <span className="text-muted-foreground">Institution:</span> {applicantSummary.institution}
            </p>
          )}
          {applicantSummary.stateOfOrigin && (
            <p>
              <span className="text-muted-foreground">State of origin:</span> {applicantSummary.stateOfOrigin}
            </p>
          )}
          {applicantSummary.gender && (
            <p>
              <span className="text-muted-foreground">Gender:</span> {applicantSummary.gender}
            </p>
          )}
          <p>
            {joinLink ? (
              <a href={joinLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Join meeting
              </a>
            ) : (
              <span className="text-muted-foreground">No meeting link recorded yet.</span>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );

  if (criteria.length === 0) {
    return (
      <div className="grid gap-6">
        {header}
        <InterviewQuestionsPanel interviewId={interview.id} framework={questionFrameworkViewModel} />
        <Card>
          <CardHeader>
            <CardTitle>No interview scoring criteria configured yet</CardTitle>
            <CardDescription>
              No active interview scoring criteria exist for this cohort yet. Check back once a Programme
              Director configures the interview scoring rubric.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (LOCKED_STATUSES.has(score.status)) {
    const breakdown = await getInterviewScoreBreakdownForActor(user.id, score.id);
    return (
      <div className="grid gap-6">
        {header}
        <InterviewQuestionsPanel interviewId={interview.id} framework={questionFrameworkViewModel} />
        <InterviewSummary
          applicantName={applicantName}
          status={score.status}
          comments={commentsViewModel}
          submittedAt={score.submittedAt ? score.submittedAt.toISOString() : null}
          total={breakdown.total.toString()}
          maxPossible={breakdown.maxPossible.toString()}
          criteria={criteriaViewModels}
          breakdown={breakdown.criteria.map((c) => ({ criterionId: c.criterionId, rawScore: c.rawScore ? c.rawScore.toString() : null }))}
          submittedCount={submittedCount}
          totalPanelists={totalPanelists}
          scoringClosed={scoringClosed}
          interviewAverage={interviewAverage ? interviewAverage.toString() : null}
        />
      </div>
    );
  }

  const scoreViewModels: ScoreViewModel[] = score.entries.map((e) => ({ criterionId: e.criterionId, score: e.score.toString() }));

  return (
    <div className="grid gap-6">
      {header}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{applicantName}</h1>
        <p className="text-muted-foreground text-sm">
          {submittedCount} of {totalPanelists} panellists have submitted so far.
        </p>
      </div>
      <InterviewQuestionsPanel interviewId={interview.id} framework={questionFrameworkViewModel} />
      <InterviewScoringForm
        interviewScoreId={score.id}
        criteria={criteriaViewModels}
        initialScores={scoreViewModels}
        initialComments={commentsViewModel}
      />
    </div>
  );
}
