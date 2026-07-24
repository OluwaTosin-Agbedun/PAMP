import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import { getAssignmentMonitoringForExport } from "./assignmentMonitoringService";
import type { AssignmentMonitoringFilters } from "../types";

const CSV_COLUMNS = [
  "Application Number",
  "Applicant Name",
  "Pathway",
  "Overall Status",
  "Reviewers (slot: name, status)",
  "Conflict Flagged",
  "Third Review Triggered",
  "Overdue",
  "Assigned Date",
  "Due Date",
] as const;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * CSV export of the Assignment Monitoring table (Phase 3D §"EXPORT").
 * Deliberately data-minimized versus the on-screen table: operational
 * status/assignment fields only — no email addresses, no individual
 * review scores or comments, nothing from `User` beyond a reviewer's
 * display name. A downloaded file has a materially wider potential
 * distribution than an on-screen view behind a session; the export
 * surface is narrower on purpose, not by omission. See
 * docs/adr/ADR-operational-export-controls.md.
 *
 * "Excel-compatible" is satisfied with plain CSV (a UTF-8 BOM prefix so
 * Excel detects the encoding correctly) rather than a generated `.xlsx`
 * binary — Excel opens CSV natively, and this codebase's existing `xlsx`
 * dependency is only ever used for *reading* imports (Sequence 1), never
 * writing; adding a write path for one export screen was judged
 * disproportionate. See the same ADR.
 */
export async function exportAssignmentMonitoringCsv(
  actorId: string,
  programmeId: string,
  cohortId: string,
  filters: Omit<AssignmentMonitoringFilters, "page" | "pageSize">,
): Promise<string> {
  const actor = await requirePermission(actorId, PERMISSIONS.REVIEW_OPERATIONS_EXPORT);

  const rows = await getAssignmentMonitoringForExport(actorId, programmeId, cohortId, filters);

  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    const reviewerSummary = row.reviewers.map((r) => `${r.slot}: ${r.reviewerName} (${r.assignmentStatus})`).join(" | ");
    lines.push(
      [
        row.applicationNumber,
        row.applicantName,
        row.pathway ?? "",
        row.overallStatus,
        reviewerSummary,
        row.hasConflict ? "Yes" : "No",
        row.hasThirdReview ? "Yes" : "No",
        row.isOverdue ? "Yes" : "No",
        row.assignedAt ?? "",
        row.dueDate ?? "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REVIEW_OPERATIONS_EXPORTED,
    entityType: "Cohort",
    entityId: cohortId,
    metadata: { rowCount: rows.length, filters },
    programmeId,
    cohortId,
  });

  const BOM = "﻿";
  return BOM + lines.join("\r\n");
}
