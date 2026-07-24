import { NextRequest } from "next/server";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermissionApi } from "@/lib/permissions/guard";
import { contentTypeForStorageKey, readStoredDocument } from "@/lib/storage/documentStorage";

/** Serves a locally re-hosted applicant document — gated on the same
 *  permission as viewing the applicant record itself, and rendered
 *  inline (not force-downloaded) so the portal's popup preview can
 *  embed it directly. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ storageKey: string }> }) {
  const { user, response } = await requirePermissionApi(PERMISSIONS.APPLICATIONS_VIEW);
  if (!user) return response;

  const { storageKey } = await params;
  const buffer = await readStoredDocument(storageKey);
  if (!buffer) {
    return new Response("Document not found.", { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentTypeForStorageKey(storageKey),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
