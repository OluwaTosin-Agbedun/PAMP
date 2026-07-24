import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getApplicationOperationsDetail } from "@/modules/reviewOperations/services/applicationDetailService";

import { DeclareConflictForm } from "./declare-conflict-form";
import { NotesPanel } from "./notes-panel";
import { ReassignDialog } from "./reassign-dialog";

export const metadata: Metadata = {
  title: "Application review operations — PAM-P FMS",
};

const REASSIGNABLE_STATUSES = new Set(["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]);

export default async function ApplicationOperationsDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const user = await requirePagePermission(PERMISSIONS.REVIEW_OPERATIONS_VIEW);
  const { applicationId } = await params;

  let detail;
  try {
    detail = await getApplicationOperationsDetail(user.id, applicationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { application, activeAssignments, conflicts, escalation, notes, auditEvents, availableReviewers } = detail;

  const canReassign = permissionsForRole(user.role).includes(PERMISSIONS.ASSIGNMENTS_REASSIGN);
  const canManageConflicts = permissionsForRole(user.role).includes(PERMISSIONS.CONFLICTS_MANAGE);
  const canCreateNotes = permissionsForRole(user.role).includes(PERMISSIONS.ADMINISTRATIVE_NOTES_CREATE);

  const reassignableAssignments = activeAssignments
    .filter((a) => REASSIGNABLE_STATUSES.has(a.status))
    .map((a) => ({ id: a.id, slot: a.slot, reviewerId: a.reviewerId, reviewerName: a.reviewer.name }));

  const noteViewModels = notes.map((n) => ({
    id: n.id,
    body: n.body,
    authorName: n.author.name,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {application.applicant.firstName} {application.applicant.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {application.applicant.externalRef ?? application.id} · {application.pathway ?? "No pathway"}
          </p>
        </div>
        {escalation && <Badge variant="destructive">Third review escalation</Badge>}
        {conflicts.length > 0 && <Badge variant="outline">{conflicts.length} conflict(s) recorded</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Assigned reviewers</CardTitle>
                {canReassign && (
                  <ReassignDialog
                    applicationId={application.id}
                    assignments={reassignableAssignments}
                    availableReviewers={availableReviewers}
                  />
                )}
              </div>
              <CardDescription>
                Each reviewer&apos;s own score and comment, shown for oversight — reviewers themselves never see
                this page or each other&apos;s work.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {activeAssignments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No active assignment.</p>
              ) : (
                activeAssignments.map((a, index) => (
                  <div key={a.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {a.slot}: {a.reviewer.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Assignment: {a.status} · Review: {a.review?.status ?? "Not started"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs">Reviewer score</p>
                        <p className="text-sm font-semibold">{a.review?.totalScore?.toString() ?? "—"}</p>
                      </div>
                    </div>
                    {a.review?.comments && (
                      <div className="mt-2">
                        <p className="text-muted-foreground text-xs">Reviewer comment</p>
                        <p className="text-sm whitespace-pre-wrap">{a.review.comments}</p>
                      </div>
                    )}
                    {index < activeAssignments.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {escalation && (
            <Card>
              <CardHeader>
                <CardTitle>Third-review escalation</CardTitle>
                <CardDescription>
                  Divergence {escalation.scoreDifference.toString()}pp exceeded the{" "}
                  {escalation.thresholdApplied.toString()}pp threshold applied at the time.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">Reviewer 1 ({escalation.firstReview.reviewer.name})</p>
                  <p className="text-sm font-semibold">{escalation.firstReview.totalScore?.toString() ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Reviewer 2 ({escalation.secondReview.reviewer.name})</p>
                  <p className="text-sm font-semibold">{escalation.secondReview.totalScore?.toString() ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Third reviewer</p>
                  <p className="text-sm font-semibold">
                    {escalation.thirdReviewAssignment?.reviewer.name ?? "Not yet assigned"}
                    {escalation.thirdReviewAssignment?.review?.totalScore
                      ? ` — ${escalation.thirdReviewAssignment.review.totalScore.toString()}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Final calculated score</p>
                  <p className="text-sm font-semibold">
                    {escalation.resolvedFinalScore ? (
                      <Badge>{escalation.resolvedFinalScore.toString()}</Badge>
                    ) : (
                      <Badge variant="outline">Pending third review</Badge>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {canManageConflicts && (
            <Card>
              <CardHeader>
                <CardTitle>Record a conflict of interest</CardTitle>
                <CardDescription>Excludes a reviewer from future selection on this application.</CardDescription>
              </CardHeader>
              <CardContent>
                <DeclareConflictForm applicationId={application.id} reviewers={availableReviewers} />
              </CardContent>
            </Card>
          )}

          {conflicts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recorded conflicts</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {conflicts.map((c) => (
                  <div key={c.id} className="text-sm">
                    <span className="font-medium">{c.reviewer.name}</span> — {c.reason}
                    <span className="text-muted-foreground block text-xs">
                      {c.source} · recorded by {c.declaredBy.name}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-6">
          {canCreateNotes && (
            <Card>
              <CardHeader>
                <CardTitle>Administrative notes</CardTitle>
                <CardDescription>Separate from reviewer comments — never affects a scoring outcome.</CardDescription>
              </CardHeader>
              <CardContent>
                <NotesPanel applicationId={application.id} notes={noteViewModels} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              {auditEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
              ) : (
                <ul className="grid gap-3">
                  {auditEvents.map((entry, index) => (
                    <li key={entry.id}>
                      <p className="text-sm font-medium">{entry.action.replaceAll("_", " ")}</p>
                      <p className="text-muted-foreground text-xs">
                        {entry.actor?.name ?? "System"} · {new Date(entry.createdAt).toLocaleString("en-GB")}
                      </p>
                      {index < auditEvents.length - 1 && <Separator className="mt-3" />}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
