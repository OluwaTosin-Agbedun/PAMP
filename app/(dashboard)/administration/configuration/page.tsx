import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import type { SettingCategory } from "@/lib/settings/registry";

export const metadata: Metadata = {
  title: "Configuration Centre — PAM-P FMS",
};

const CATEGORIES: { id: SettingCategory | "programme"; label: string; description: string }[] = [
  { id: "programme", label: "Programme Configuration", description: "Programme/cohort identity, intake dates, and every pipeline-stage date window." },
  { id: "eligibility", label: "Eligibility Screening Configuration", description: "The clarification response deadline before a screening auto-expires to Ineligible." },
  { id: "review", label: "Review Configuration", description: "Reviewer assignment, capacity, and third-review divergence." },
  { id: "interview", label: "Interview Configuration", description: "Panel size, duration, scoring — the Interview Engine's future settings." },
  { id: "scoring", label: "Scoring Configuration", description: "Passing thresholds and ranking, alongside what's already computed per framework." },
  { id: "notification", label: "Notification Configuration", description: "Sender name, reply address, and delivery retry limit for the real Microsoft Graph Mail notification system." },
  { id: "reports", label: "Reports Configuration", description: "The Analytics Dashboard's default date-range filter." },
  { id: "file_upload", label: "File Upload Configuration", description: "Import size/type limits, plus future document-upload controls." },
  { id: "security", label: "Security Configuration", description: "Password policy, session, and audit retention." },
];

export default async function ConfigurationCentrePage() {
  await requirePagePermission(PERMISSIONS.CONFIGURATION_VIEW);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuration Centre</h1>
        <p className="text-muted-foreground text-sm">
          Every admin-tunable operational value in one place. Changes here are audited and take effect immediately unless a
          setting&apos;s own description says otherwise.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => (
          <Link key={category.id} href={`/administration/configuration/${category.id}`}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{category.label}</CardTitle>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                </div>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
