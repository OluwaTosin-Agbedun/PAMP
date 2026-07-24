import { NextRequest } from "next/server";

import { getActiveCohort } from "@/lib/cohort";
import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags/service";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermissionApi } from "@/lib/permissions/guard";
import { exportAssignmentMonitoringCsv } from "@/modules/reviewOperations/services/exportService";

/** CSV export (Phase 3D §"EXPORT") — a Route Handler, not a Server Action, since triggering a browser file download needs a real `Response` with a `Content-Disposition` header. */
export async function GET(request: NextRequest) {
  const { user, response } = await requirePermissionApi(PERMISSIONS.REVIEW_OPERATIONS_EXPORT);
  if (!user) return response;

  // Release 1.5 Feature Flags — "no feature should require code removal
  // to disable." An administrator can turn this off system-wide even
  // for permitted users, without deploying a code change.
  if (!(await isFeatureEnabled(FEATURE_FLAGS.EXPORTS))) {
    return new Response("Exports are currently disabled.", { status: 403 });
  }

  const cohort = await getActiveCohort();
  const params = request.nextUrl.searchParams;

  const csv = await exportAssignmentMonitoringCsv(user.id, cohort.programmeId, cohort.id, {
    reviewerId: params.get("reviewerId") ?? undefined,
    status: params.get("status") ?? undefined,
    pathway: params.get("pathway") ?? undefined,
    overdueOnly: params.get("overdueOnly") === "true",
    conflictOnly: params.get("conflictOnly") === "true",
    thirdReviewOnly: params.get("thirdReviewOnly") === "true",
    assignedFrom: params.get("assignedFrom") ?? undefined,
    assignedTo: params.get("assignedTo") ?? undefined,
  });

  const filename = `review-assignments-${cohort.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
