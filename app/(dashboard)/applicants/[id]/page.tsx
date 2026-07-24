import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SCREENING_STATUS_BADGE_VARIANT, SCREENING_STATUS_LABELS } from "@/app/(dashboard)/eligibility-screening/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import {
  ELIGIBILITY_BADGE_VARIANT,
  ELIGIBILITY_LABELS,
  STAGE_LABELS,
} from "@/modules/applicants/labels";
import { getApplicationAuditLog, getApplicationDetail } from "@/modules/applicants/repository";
import { listRecommendationsForApplication } from "@/modules/eligibilityQa/services/recommendationService";

import { DeleteApplicantButton } from "./delete-applicant-button";
import { DocumentViewerButton } from "./document-viewer-button";
import { EligibilityQaCard, type RecommendationViewModel } from "./eligibility-qa-card";

export const metadata: Metadata = {
  title: "Applicant — PAM-P FMS",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium break-words">{value || "—"}</p>
    </div>
  );
}

export default async function ApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission(PERMISSIONS.APPLICATIONS_VIEW);
  const { id } = await params;

  const application = await getApplicationDetail(id);
  if (!application) {
    notFound();
  }

  const auditLog = await getApplicationAuditLog(id);
  const screening = application.eligibilityScreening;
  // Matches recommendationService.ts's own guard: a recommendation needs
  // *some* outcome to react to, but that outcome doesn't have to be
  // terminal — Clarification Required is exactly the status an
  // Eligibility Reviewer (recommend-only) most needs to flag.
  const hasDecision = screening ? screening.status !== "PENDING_SCREENING" : false;
  const essayAnswers = (application.essayAnswers as Record<string, string> | null) ?? {};

  const granted = permissionsForRole(user.role);
  const canViewEligibilityQa = granted.includes(PERMISSIONS.ELIGIBILITY_REVIEW);
  const canRecommend = granted.includes(PERMISSIONS.ELIGIBILITY_RECOMMENDATIONS_CREATE);
  const canExecute = granted.includes(PERMISSIONS.ELIGIBILITY_OVERRIDE_EXECUTE);
  const canDelete = granted.includes(PERMISSIONS.APPLICATIONS_DELETE);
  const recommendations: RecommendationViewModel[] = canViewEligibilityQa
    ? (await listRecommendationsForApplication(user.id, id)).map((r) => ({
        id: r.id,
        currentIsEligible: r.currentIsEligible,
        recommendedIsEligible: r.recommendedIsEligible,
        reason: r.reason,
        status: r.status,
        raisedByName: r.raisedBy.name,
        createdAt: r.createdAt.toISOString(),
        executedByName: r.executedBy?.name ?? null,
        executionNote: r.executionNote,
      }))
    : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {application.applicant.firstName} {application.applicant.lastName}
          </h1>
          <Badge variant={ELIGIBILITY_BADGE_VARIANT[application.eligibilityStatus]}>
            {ELIGIBILITY_LABELS[application.eligibilityStatus]}
          </Badge>
          <Badge variant="outline">{STAGE_LABELS[application.stage]}</Badge>
        </div>
        {canDelete && (
          <DeleteApplicantButton
            applicationId={application.id}
            applicantName={`${application.applicant.firstName} ${application.applicant.lastName}`}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Email" value={application.applicant.email} />
              <Field label="Phone" value={application.applicant.phone} />
              <Field label="Gender" value={application.applicant.gender} />
              <Field
                label="Date of birth"
                value={
                  application.applicant.dateOfBirth
                    ? new Date(application.applicant.dateOfBirth).toLocaleDateString("en-GB")
                    : null
                }
              />
              <Field label="State of origin" value={application.applicant.stateOfOrigin} />
              <Field label="Institution" value={application.applicant.institution} />
              <Field label="Pathway" value={application.pathway} />
              <Field label="External reference" value={application.applicant.externalRef} />
            </CardContent>
          </Card>

          {Object.keys(essayAnswers).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Additional submitted data</CardTitle>
                <CardDescription>Imported columns not mapped to a core field.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {Object.entries(essayAnswers).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">{key}</p>
                    {/^https?:\/\/\S+$/i.test(value?.trim() ?? "") ? (
                      <a
                        href={value.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm break-words hover:underline"
                      >
                        {value.trim()}
                      </a>
                    ) : (
                      <p className="text-sm break-words whitespace-pre-wrap">{value || "—"}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {application.documents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No documents on file for this applicant yet.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {application.documents.map((doc) => (
                    <li key={doc.id} className="min-w-0 text-sm">
                      <span className="font-medium">{doc.type}</span>
                      {" — "}
                      <DocumentViewerButton type={doc.type} fileName={doc.fileName} storageKey={doc.storageKey} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Eligibility decision</CardTitle>
              <CardDescription>
                {screening?.decidedAt
                  ? `Decided ${new Date(screening.decidedAt).toLocaleString("en-GB")}`
                  : screening
                    ? "Not yet decided"
                    : "Not yet screened"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {!screening ? (
                <p className="text-muted-foreground text-sm">
                  This application hasn&apos;t been through eligibility screening yet.
                </p>
              ) : (
                <>
                  <div>
                    <Badge variant={SCREENING_STATUS_BADGE_VARIANT[screening.status]}>
                      {SCREENING_STATUS_LABELS[screening.status]}
                    </Badge>
                  </div>
                  {screening.reasonForDecision && (
                    <p className="text-sm">{screening.reasonForDecision}</p>
                  )}
                  {screening.outstandingClarification && (
                    <p className="text-sm">
                      <span className="font-medium">Outstanding: </span>
                      {screening.outstandingClarification}
                    </p>
                  )}
                  {screening.integrityNote && (
                    <p className="text-destructive text-sm">
                      <span className="font-medium">Integrity note: </span>
                      {screening.integrityNote}
                    </p>
                  )}
                  <Button asChild size="sm" variant="outline" className="w-fit">
                    <Link href={`/eligibility-screening/${application.id}`}>View full checklist</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <EligibilityQaCard
            applicationId={application.id}
            recommendations={recommendations}
            canRecommend={canRecommend}
            canExecute={canExecute}
            hasDecision={hasDecision}
          />

          <Card>
            <CardHeader>
              <CardTitle>Assigned reviewers</CardTitle>
            </CardHeader>
            <CardContent>
              {application.reviewAssignments.length === 0 ? (
                <p className="text-muted-foreground text-sm">Not yet assigned.</p>
              ) : (
                <ul className="grid gap-2">
                  {application.reviewAssignments.map((assignment) => (
                    <li key={assignment.id} className="flex items-center justify-between text-sm">
                      <span>{assignment.reviewer.name}</span>
                      <Badge variant="outline">{assignment.slot}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
              ) : (
                <ul className="grid gap-3">
                  {auditLog.map((entry, index) => (
                    <li key={entry.id}>
                      <p className="text-sm font-medium">{entry.action.replaceAll("_", " ")}</p>
                      <p className="text-muted-foreground text-xs">
                        {entry.actor?.name ?? "System"} · {new Date(entry.createdAt).toLocaleString("en-GB")}
                      </p>
                      {index < auditLog.length - 1 && <Separator className="mt-3" />}
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
