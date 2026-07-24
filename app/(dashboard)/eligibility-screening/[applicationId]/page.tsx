import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { CHECKLIST_SECTIONS } from "@/modules/eligibility/checklistDefinition";
import { canMarkEligible } from "@/modules/eligibility/checklistValidation";
import { getScreeningWorkspace } from "@/modules/eligibility/screeningService";

import { ChecklistSectionCard } from "./checklist-section-card";
import { DecisionPanel } from "./decision-panel";
import {
  AssignScreenerControl,
  ExtendClarificationDeadlineButton,
  ReopenScreeningButton,
  ResolveClarificationButton,
  SecondReviewButton,
} from "./screening-controls";
import { NEXT_ACTION_LABELS, SCREENING_STATUS_BADGE_VARIANT, SCREENING_STATUS_LABELS, type ChecklistItemViewModel } from "../types";

export const metadata: Metadata = {
  title: "Eligibility Screening — PAM-P FMS",
};

const DIVERSITY_FIELDS: { label: string; value: (applicant: { gender: string | null; stateOfOrigin: string | null }, application: { pathway: string | null }) => string | null }[] = [
  { label: "Gender", value: (a) => a.gender },
  { label: "State of Origin", value: (a) => a.stateOfOrigin },
  { label: "Selected Pathway", value: (_a, app) => app.pathway },
];

export default async function ScreeningDetailPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const currentUser = await requirePagePermission(PERMISSIONS.ELIGIBILITY_SCREENING_VIEW);
  const { applicationId } = await params;

  let workspace;
  try {
    workspace = await getScreeningWorkspace(currentUser.id, applicationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { screening, duplicates } = workspace;
  const application = screening.application;
  const applicant = application.applicant;

  const allActiveUsers = await prisma.user.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, role: true } });
  const screeners = allActiveUsers.filter((u) => permissionsForRole(u.role).includes(PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM)).map((u) => ({ id: u.id, name: u.name }));

  const granted = permissionsForRole(currentUser.role);
  const canAssign = granted.includes(PERMISSIONS.ELIGIBILITY_SCREENING_ASSIGN);
  const canPerform = granted.includes(PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);
  const canDisqualify = granted.includes(PERMISSIONS.ELIGIBILITY_SCREENING_DISQUALIFY);
  const canSecondReview = granted.includes(PERMISSIONS.ELIGIBILITY_SCREENING_SECOND_REVIEW);
  const canReopen = granted.includes(PERMISSIONS.ELIGIBILITY_SCREENING_REOPEN);
  const canExtendDeadline = granted.includes(PERMISSIONS.ELIGIBILITY_SCREENING_EXTEND_DEADLINE);

  const itemsBySection = (section: keyof typeof CHECKLIST_SECTIONS): ChecklistItemViewModel[] =>
    CHECKLIST_SECTIONS[section].items.map((definition) => {
      const record = screening.checklistItems.find((i) => i.section === section && i.itemKey === definition.key);
      return {
        section,
        itemKey: definition.key,
        label: definition.label,
        evidence: definition.evidence,
        status: record?.status ?? null,
        comment: record?.comment ?? null,
        isAutomatic: record?.isAutomatic ?? false,
        updatedByName: record?.updatedBy?.name ?? null,
      };
    });

  const eligibleCheck = canMarkEligible(screening.checklistItems.map((i) => ({ section: i.section, itemKey: i.itemKey, status: i.status })));
  const isTerminal = ["ELIGIBLE", "INELIGIBLE", "DISQUALIFIED"].includes(screening.status);
  const canRecordDecision = canPerform && !isTerminal;

  return (
    <div className="grid gap-6">
      <Link href="/eligibility-screening" className="text-muted-foreground text-sm hover:underline">
        ← Back to Eligibility Screening
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {applicant.firstName} {applicant.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">Stage 1: Eligibility Screening — not scored.</p>
        </div>
        <Link href={`/applicants/${applicationId}`} className="text-primary text-sm hover:underline">
          View full applicant record
        </Link>
      </div>

      {duplicates.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Possible duplicate application</CardTitle>
            <CardDescription>
              Matched on {duplicates.flatMap((d) => d.matchedOn).join(", ")} against:{" "}
              {duplicates.map((d) => d.applicantName).join(", ")}. Resolve this in the Integrity section below before a
              final decision.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Screening Control</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={SCREENING_STATUS_BADGE_VARIANT[screening.status]}>{SCREENING_STATUS_LABELS[screening.status]}</Badge>
            {screening.nextAction && <Badge variant="outline">Next: {NEXT_ACTION_LABELS[screening.nextAction]}</Badge>}
            {screening.secondReviewRequired && (
              <Badge variant="outline">{screening.secondReviewCompletedAt ? "Second review complete" : "Second review required"}</Badge>
            )}
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <AssignScreenerControl applicationId={applicationId} currentScreenerId={screening.screenerId} screeners={screeners} canAssign={canAssign} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ResolveClarificationButton applicationId={applicationId} visible={canPerform && screening.status === "CLARIFICATION_REQUIRED"} />
            <ExtendClarificationDeadlineButton applicationId={applicationId} visible={canExtendDeadline && screening.status === "CLARIFICATION_REQUIRED"} />
            <SecondReviewButton applicationId={applicationId} visible={canSecondReview && screening.secondReviewRequired && !screening.secondReviewCompletedAt} />
            <ReopenScreeningButton applicationId={applicationId} visible={canReopen && isTerminal} />
          </div>
          {screening.reasonForDecision && (
            <p className="text-sm">
              <span className="text-muted-foreground">Reason:</span> {screening.reasonForDecision}
            </p>
          )}
          {screening.outstandingClarification && (
            <p className="text-sm">
              <span className="text-muted-foreground">Outstanding clarification:</span> {screening.outstandingClarification}
            </p>
          )}
          {screening.status === "CLARIFICATION_REQUIRED" && screening.clarificationDeadlineAt && (
            <p className="text-sm">
              <span className="text-muted-foreground">Clarification due by:</span>{" "}
              {new Date(screening.clarificationDeadlineAt).toLocaleString("en-GB")}
            </p>
          )}
        </CardContent>
      </Card>

      <ChecklistSectionCard
        title="Required Application Documents"
        description="All required documents must be present and readable. The passport photograph is for identification only and must never be scored."
        items={itemsBySection("DOCUMENT")}
        applicationId={applicationId}
        canEdit={canRecordDecision}
      />

      <ChecklistSectionCard
        title="Baseline Eligibility Requirements"
        description="Confirms whether the applicant is eligible to proceed to application scoring."
        items={itemsBySection("BASELINE")}
        applicationId={applicationId}
        canEdit={canRecordDecision}
      />

      <ChecklistSectionCard
        title="Consistency and Integrity Checks"
        description="Protects the credibility of the selection process. Any serious integrity concern should be escalated."
        items={itemsBySection("INTEGRITY")}
        applicationId={applicationId}
        canEdit={canRecordDecision}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diversity Information</CardTitle>
          <CardDescription>For cohort-balancing tracking only — never used to reject an applicant at eligibility screening.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {DIVERSITY_FIELDS.map((field) => (
            <div key={field.label}>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">{field.label}</p>
              <p className="text-sm font-medium">{field.value(applicant, application) || "—"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {!eligibleCheck.ok && canRecordDecision && (
        <p className="text-muted-foreground text-sm">Not yet ready to mark Eligible: {eligibleCheck.reason}</p>
      )}

      <DecisionPanel applicationId={applicationId} canPerform={canRecordDecision} canDisqualify={canDisqualify && !isTerminal} canMarkEligible={eligibleCheck.ok} />
    </div>
  );
}
