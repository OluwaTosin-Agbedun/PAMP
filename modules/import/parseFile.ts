import "server-only";

import * as XLSX from "xlsx";

export type ParsedSpreadsheet = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Reads .xlsx or .csv into header + row data. Restricted to admin/
 * secretary upload (see requireAction("applicant:import")) — not a
 * public-facing parser, which matters given SheetJS's npm-published
 * 0.18.5 has known advisories in less-common code paths we don't use
 * (formula evaluation, legacy binary formats). Only sheet_to_json is used.
 */
export function parseSpreadsheet(buffer: ArrayBuffer): ParsedSpreadsheet {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  // sheet_to_json attaches a non-enumerable __rowNum__ to every row; spreading
  // keeps only enumerable own properties, giving back a truly plain object
  // that can cross the Server Action → Client Component boundary.
  const rows = rawRows.map((row) => ({ ...row }));

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}
