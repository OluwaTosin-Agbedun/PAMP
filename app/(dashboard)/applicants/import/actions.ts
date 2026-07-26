"use server";

import { del, get } from "@vercel/blob";

import { getActiveCohort } from "@/lib/cohort";
import { AppError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requireActionPermission } from "@/lib/permissions/guard";
import { getStringSettingValue } from "@/lib/settings/service";
import { suggestMapping, type ColumnMapping } from "@/modules/import/mapping";
import { parseSpreadsheet, type ParsedSpreadsheet } from "@/modules/import/parseFile";
import { runImport, type ImportSummary } from "@/modules/import/service";

/**
 * The uploaded file lives in Blob storage (see app/api/import/blob-upload),
 * never in a Server Action request body — Vercel's platform body-size
 * ceiling (~4.5MB) sits well below what a real applicant export can reach.
 * For the same reason, the full parsed rows are never sent back down to
 * the client either: commitImportAction re-reads and re-parses the blob
 * itself rather than round-tripping every row through the browser.
 */
async function readBlobSpreadsheet(pathname: string): Promise<ParsedSpreadsheet> {
  const result = await get(pathname, { access: "private" });
  if (!result) {
    throw new NotFoundError("The uploaded file could not be found. Please upload it again.");
  }
  const buffer = await new Response(result.stream).arrayBuffer();
  return parseSpreadsheet(buffer);
}

export type ParseResult =
  | {
      ok: true;
      pathname: string;
      headers: string[];
      previewRows: Record<string, string>[];
      rowCount: number;
      suggestedMapping: ColumnMapping;
    }
  | { ok: false; error: string };

export async function parseImportFileAction(params: { pathname: string; fileName: string }): Promise<ParseResult> {
  await requireActionPermission(PERMISSIONS.APPLICATIONS_IMPORT);

  const allowedTypes = await getStringSettingValue("file_upload.allowed_file_types");
  const extension = params.fileName.slice(params.fileName.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = allowedTypes.split(",").map((t) => t.trim().toLowerCase());
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, error: `That file type isn't allowed. Accepted types: ${allowedTypes}` };
  }

  let headers: string[];
  let rows: Record<string, string>[];
  try {
    ({ headers, rows } = await readBlobSpreadsheet(params.pathname));
  } catch {
    return { ok: false, error: "Couldn't read the uploaded file. Please try uploading it again." };
  }

  if (headers.length === 0 || rows.length === 0) {
    return { ok: false, error: "No rows found in that file." };
  }

  return {
    ok: true,
    pathname: params.pathname,
    headers,
    previewRows: rows.slice(0, 10),
    rowCount: rows.length,
    suggestedMapping: suggestMapping(headers),
  };
}

export type CommitResult = { ok: true; summary: ImportSummary } | { ok: false; error: string };

export async function commitImportAction(params: {
  fileName: string;
  pathname: string;
  columnMapping: ColumnMapping;
}): Promise<CommitResult> {
  const user = await requireActionPermission(PERMISSIONS.APPLICATIONS_IMPORT);

  const cohort = await getActiveCohort();

  try {
    const { rows } = await readBlobSpreadsheet(params.pathname);
    if (rows.length === 0) {
      return { ok: false, error: "Nothing to import." };
    }

    const summary = await runImport({
      cohortId: cohort.id,
      fileName: params.fileName,
      uploadedById: user.id,
      columnMapping: params.columnMapping,
      rows,
    });
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: error instanceof AppError ? error.message : "Import failed unexpectedly." };
  } finally {
    // Best-effort cleanup — the raw export (applicant PII) shouldn't
    // linger in Blob storage once it's been read into the database.
    await del(params.pathname).catch(() => {});
  }
}
