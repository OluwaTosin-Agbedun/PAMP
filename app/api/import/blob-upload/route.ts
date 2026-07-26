import "server-only";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermissionApi } from "@/lib/permissions/guard";
import { getNumericSettingValue } from "@/lib/settings/service";

/**
 * Issues a short-lived client token so the browser can upload the import
 * spreadsheet directly to Blob storage. Required because Vercel's platform
 * enforces a ~4.5MB request body ceiling on Serverless Functions ahead of
 * any Next.js-level config — a real applicant export routinely exceeds
 * that, so the file can no longer be sent through a Server Action body
 * (see applicants/import/actions.ts, which now reads the file back out of
 * Blob storage instead of receiving it directly).
 */
export async function POST(request: Request): Promise<Response> {
  const { user, response } = await requirePermissionApi(PERMISSIONS.APPLICATIONS_IMPORT);
  if (!user) return response;

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const maxSizeMb = await getNumericSettingValue("file_upload.max_size_mb");
        return {
          access: "private",
          addRandomSuffix: true,
          maximumSizeInBytes: maxSizeMb * 1024 * 1024,
        };
      },
    });
    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
