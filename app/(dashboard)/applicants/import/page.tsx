import type { Metadata } from "next";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";

import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = {
  title: "Import Applicants — PAM-P FMS",
};

export default async function ImportApplicantsPage() {
  await requirePagePermission(PERMISSIONS.APPLICATIONS_IMPORT);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import applicants</h1>
        <p className="text-muted-foreground text-sm">
          Upload the application portal export. Every application is automatically screened for
          eligibility and assigned reviewers as soon as it&apos;s imported.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
