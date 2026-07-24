import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveCohort } from "@/lib/cohort";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getProgrammeConfiguration } from "@/modules/configuration/services/configurationService";

import { ProgrammeCohortForm } from "./programme-cohort-form";
import { WindowEditor } from "./window-editor";

export const metadata: Metadata = {
  title: "Programme Configuration — PAM-P FMS",
};

const WINDOW_LABELS: Record<"ELIGIBILITY_REVIEW" | "INTERVIEW" | "EXECUTIVE_APPROVAL" | "OFFER", string> = {
  ELIGIBILITY_REVIEW: "Eligibility Review Window",
  INTERVIEW: "Interview Window",
  EXECUTIVE_APPROVAL: "Executive Approval Window",
  OFFER: "Offer Window",
};

export default async function ProgrammeConfigurationPage() {
  const user = await requirePagePermission(PERMISSIONS.CONFIGURATION_VIEW);
  const canManage = permissionsForRole(user.role).includes(PERMISSIONS.CONFIGURATION_MANAGE);

  const cohort = await getActiveCohort();
  const config = await getProgrammeConfiguration(user.id, cohort.programmeId);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Programme Configuration</h1>
        <p className="text-muted-foreground text-sm">
          Programme and cohort identity, plus every pipeline-stage date window. Changing a date here updates the whole
          system automatically — nothing downstream reads a hardcoded date.
        </p>
      </div>

      <ProgrammeCohortForm config={config} canManage={canManage} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application Review Window</CardTitle>
          <CardDescription>
            When reviewers can score applications — the same date range Phase 3D&apos;s Assignment Monitoring reads for
            &quot;overdue,&quot; and the same lookup reviewService.createReview uses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config.applicationReviewWindow ? (
            <WindowEditor
              programmeId={config.programmeId}
              cohortId={config.cohortId}
              kind="review-stage"
              reviewStageId={config.applicationReviewWindow.reviewStageId}
              opensAt={config.applicationReviewWindow.opensAt}
              closesAt={config.applicationReviewWindow.closesAt}
              canManage={canManage}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No active Application Review stage exists for this cohort yet.</p>
          )}
        </CardContent>
      </Card>

      {(Object.keys(WINDOW_LABELS) as (keyof typeof WINDOW_LABELS)[]).map((code) => (
        <Card key={code}>
          <CardHeader>
            <CardTitle className="text-base">{WINDOW_LABELS[code]}</CardTitle>
            <CardDescription>
              Configuration only — no module reads this window yet (out of scope through Release 1.5); stored so the
              future phase that needs it has a real configured date on day one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WindowEditor
              programmeId={config.programmeId}
              cohortId={config.cohortId}
              kind="programme-window"
              windowCode={code}
              opensAt={config.windows[code as keyof typeof config.windows].opensAt}
              closesAt={config.windows[code as keyof typeof config.windows].closesAt}
              canManage={canManage}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
