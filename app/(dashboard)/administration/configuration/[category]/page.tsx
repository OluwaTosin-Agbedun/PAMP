import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import type { SettingCategory } from "@/lib/settings/registry";
import { getSettingsForCategory } from "@/modules/configuration/services/configurationService";

import { SettingsList } from "../settings-list";

const CATEGORY_LABELS: Record<SettingCategory, string> = {
  programme: "Programme Configuration",
  eligibility: "Eligibility Screening Configuration",
  review: "Review Configuration",
  interview: "Interview Configuration",
  scoring: "Scoring Configuration",
  notification: "Notification Configuration",
  reports: "Reports Configuration",
  file_upload: "File Upload Configuration",
  security: "Security Configuration",
  feature: "Feature Flags",
};

// "programme" and "feature" have their own dedicated screens (structured
// Programme/Cohort/window forms; feature-flag toggles under
// /administration/feature-flags respectively) — this route only ever
// renders the flat, registry-driven categories.
const FLAT_CATEGORIES: SettingCategory[] = [
  "eligibility",
  "review",
  "interview",
  "scoring",
  "notification",
  "reports",
  "file_upload",
  "security",
];

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const label = CATEGORY_LABELS[category as SettingCategory] ?? "Configuration";
  return { title: `${label} — PAM-P FMS` };
}

export default async function ConfigurationCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const user = await requirePagePermission(PERMISSIONS.CONFIGURATION_VIEW);
  const { category } = await params;

  if (!FLAT_CATEGORIES.includes(category as SettingCategory)) notFound();
  const typedCategory = category as SettingCategory;

  const settings = await getSettingsForCategory(user.id, typedCategory);
  const canManage = permissionsForRole(user.role).includes(PERMISSIONS.CONFIGURATION_MANAGE);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{CATEGORY_LABELS[typedCategory]}</h1>
        <p className="text-muted-foreground text-sm">
          {canManage ? "Changes are saved immediately and fully audited." : "You have read-only access to this configuration."}
        </p>
      </div>

      <SettingsList settings={settings} canManage={canManage} />
    </div>
  );
}
