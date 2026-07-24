import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { listPendingRecommendations } from "@/modules/eligibilityQa/services/recommendationService";

export const metadata: Metadata = {
  title: "Eligibility Recommendations — PAM-P FMS",
};

export default async function EligibilityRecommendationsPage() {
  const user = await requirePagePermission(PERMISSIONS.ELIGIBILITY_OVERRIDE_EXECUTE);
  const pending = await listPendingRecommendations(user.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eligibility Recommendations</h1>
        <p className="text-muted-foreground text-sm">
          Pending flags from Eligibility Reviewers. Open an application to execute or dismiss its recommendation.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No pending recommendations</CardTitle>
            <CardDescription>Every flagged case has been resolved.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pending.map((r) => (
            <Link key={r.id} href={`/applicants/${r.applicationId}`}>
              <Card className="transition-colors hover:border-primary">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {r.application.applicant.firstName} {r.application.applicant.lastName}
                    </CardTitle>
                    <Badge variant="outline">
                      {r.currentIsEligible ? "Eligible" : "Ineligible"} → {r.recommendedIsEligible ? "Eligible" : "Ineligible"}
                    </Badge>
                  </div>
                  <CardDescription>
                    Raised by {r.raisedBy.name} · {new Date(r.createdAt).toLocaleString("en-GB")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{r.reason}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
