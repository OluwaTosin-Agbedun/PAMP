"use server";

import { getActiveCohort } from "@/lib/cohort";
import { AppError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requireActionPermission } from "@/lib/permissions/guard";
import { getNumericSettingValue, getStringSettingValue } from "@/lib/settings/service";
import { suggestMapping, type ColumnMapping } from "@/modules/import/mapping";
import { parseSpreadsheet } from "@/modules/import/parseFile";
import { runImport, type ImportSummary } from "@/modules/import/service";

export type ParseResult =
  | { ok: true; headers: string[]; previewRows: Record<string, string>[]; rows: Record<string, string>[]; suggestedMapping: ColumnMapping }
  | { ok: false; error: string };

export async function parseImportFileAction(formData: FormData): Promise<ParseResult> {
  await requireActionPermission(PERMISSIONS.APPLICATIONS_IMPORT);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a .xlsx or .csv file." };
  }

  // Release 1.5 File Upload Configuration — previously the only check
  // here was rejecting an empty file; both limits now come from the
  // Configuration Centre instead of being unenforced.
  const [maxSizeMb, allowedTypes] = await Promise.all([
    getNumericSettingValue("file_upload.max_size_mb"),
    getStringSettingValue("file_upload.allowed_file_types"),
  ]);
  if (file.size > maxSizeMb * 1024 * 1024) {
    return { ok: false, error: `That file is larger than the ${maxSizeMb}MB limit.` };
  }
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = allowedTypes.split(",").map((t) => t.trim().toLowerCase());
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, error: `That file type isn't allowed. Accepted types: ${allowedTypes}` };
  }

  const buffer = await file.arrayBuffer();
  const { headers, rows } = parseSpreadsheet(buffer);

  if (headers.length === 0 || rows.length === 0) {
    return { ok: false, error: "No rows found in that file." };
  }

  return {
    ok: true,
    headers,
    previewRows: rows.slice(0, 10),
    rows,
    suggestedMapping: suggestMapping(headers),
  };
}

export type CommitResult = { ok: true; summary: ImportSummary } | { ok: false; error: string };

export async function commitImportAction(params: {
  fileName: string;
  columnMapping: ColumnMapping;
  rows: Record<string, string>[];
}): Promise<CommitResult> {
  const user = await requireActionPermission(PERMISSIONS.APPLICATIONS_IMPORT);

  if (params.rows.length === 0) {
    return { ok: false, error: "Nothing to import." };
  }

  const cohort = await getActiveCohort();

  try {
    const summary = await runImport({
      cohortId: cohort.id,
      fileName: params.fileName,
      uploadedById: user.id,
      columnMapping: params.columnMapping,
      rows: params.rows,
    });
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: error instanceof AppError ? error.message : "Import failed unexpectedly." };
  }
}
