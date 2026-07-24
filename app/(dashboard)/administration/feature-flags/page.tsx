import type { Metadata } from "next";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { getFeatureFlagsForAdmin } from "@/lib/featureFlags/service";

import { FeatureFlagList } from "./flag-list";

export const metadata: Metadata = {
  title: "Feature Flags — PAM-P FMS",
};

export default async function FeatureFlagsPage() {
  const user = await requirePagePermission(PERMISSIONS.FEATURE_FLAGS_MANAGE);
  const flags = await getFeatureFlagsForAdmin(user.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feature Flags</h1>
        <p className="text-muted-foreground text-sm">
          Every flag disables its feature behind an if-check at its entry point — never by removing code, so re-enabling
          is always just a flip back.
        </p>
      </div>

      <FeatureFlagList flags={flags} />
    </div>
  );
}
