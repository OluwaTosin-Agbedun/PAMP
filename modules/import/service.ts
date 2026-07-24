import "server-only";

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { downloadAndStoreDocument } from "@/lib/storage/documentStorage";
import { runAutomaticEligibilityDecision } from "@/modules/eligibility/screeningService";

import { applyMapping, findDuplicateMappings, splitExtraIntoTextAndDocuments, type ColumnMapping } from "./mapping";
import {
  mappedRowSchema,
  parseAvailabilityDeclared,
  parseDateOfBirth,
  parseNyscCompletionDate,
  parseNyscStatus,
  parseSubmittedAt,
} from "./validateRow";

export type ImportSummary = {
  batchId: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  screeningsEnsured: number;
  errors: { rowNumber: number; errorMessage: string }[];
};

export async function runImport(params: {
  cohortId: string;
  fileName: string;
  uploadedById: string;
  columnMapping: ColumnMapping;
  rows: Record<string, string>[];
}): Promise<ImportSummary> {
  const { cohortId, fileName, uploadedById, columnMapping, rows } = params;

  // A duplicate target means two (or more) different source columns
  // would write to the same applicant field — for externalRef/email,
  // the fields upserts key on, that silently merges unrelated
  // applicants' rows into one record. Reject the whole import before
  // creating a batch or touching any row, rather than partially import
  // and corrupt data (see docs/import mapping fix, July 2026).
  const duplicates = findDuplicateMappings(columnMapping);
  if (duplicates.length > 0) {
    const detail = duplicates.map((d) => `${d.field} ← ${d.headers.join(", ")}`).join("; ");
    throw new ValidationError(`Multiple columns are mapped to the same field: ${detail}. Fix the mapping before importing.`);
  }

  const batch = await prisma.importBatch.create({
    data: {
      cohortId,
      fileName,
      uploadedById,
      columnMapping,
      totalRows: rows.length,
      status: "PROCESSING",
    },
  });

  let successCount = 0;
  const rowErrors: { rowNumber: number; rawData: Record<string, string>; errorMessage: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // +1 for 1-indexing, +1 for the header row
    const raw = rows[i];
    const { core, extra } = applyMapping(raw, columnMapping);
    const { essayAnswers, documents: linkedDocuments } = splitExtraIntoTextAndDocuments(extra);

    // Re-host each document immediately, outside the transaction below
    // (this is network I/O, not a DB write) — most source portals hand
    // out short-lived signed URLs (e.g. Supabase, expiring within the
    // hour), so a link stored verbatim and opened later is often
    // already dead. Downloading now, while the link is still fresh,
    // means the document stays viewable indefinitely. A failed
    // download (already expired, network error) falls back to the
    // original link rather than losing the reference entirely.
    const documents = await Promise.all(
      linkedDocuments.map(async (doc) => {
        const stored = await downloadAndStoreDocument(doc.storageKey);
        return stored ? { ...doc, storageKey: stored.storageKey } : doc;
      }),
    );

    const parsed = mappedRowSchema.safeParse(core);
    if (!parsed.success) {
      rowErrors.push({
        rowNumber,
        rawData: raw,
        errorMessage: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }

    const { date: dateOfBirth, error: dobError } = parseDateOfBirth(parsed.data.dateOfBirth);
    if (dobError) {
      rowErrors.push({ rowNumber, rawData: raw, errorMessage: dobError });
      continue;
    }
    const { date: nyscCompletionDate, error: nyscDateError } = parseNyscCompletionDate(parsed.data.nyscCompletionDate);
    if (nyscDateError) {
      rowErrors.push({ rowNumber, rawData: raw, errorMessage: nyscDateError });
      continue;
    }
    const { date: submittedAt, error: submittedAtError } = parseSubmittedAt(parsed.data.submittedAt);
    if (submittedAtError) {
      rowErrors.push({ rowNumber, rawData: raw, errorMessage: submittedAtError });
      continue;
    }
    const { status: nyscStatus } = parseNyscStatus(parsed.data.nyscStatus);
    const availabilityDeclared = parseAvailabilityDeclared(parsed.data.availabilityDeclared);

    const data = parsed.data;

    let importedApplicationId: string | null = null;

    try {
      await prisma.$transaction(async (tx) => {
        const applicantPayload = {
          externalRef: data.externalRef || null,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone || null,
          gender: data.gender || null,
          dateOfBirth,
          stateOfOrigin: data.stateOfOrigin || null,
          institution: data.institution || null,
          nationality: data.nationality || null,
          governmentIdType: data.governmentIdType || null,
          governmentIdNumber: data.governmentIdNumber || null,
          nyscStatus,
          nyscCompletionDate,
        };

        const applicant = data.externalRef
          ? await tx.applicant.upsert({
              where: { cohortId_externalRef: { cohortId, externalRef: data.externalRef } },
              create: { cohortId, ...applicantPayload },
              update: applicantPayload,
            })
          : await tx.applicant.upsert({
              where: { cohortId_email: { cohortId, email: data.email } },
              create: { cohortId, ...applicantPayload },
              update: applicantPayload,
            });

        const application = await tx.application.upsert({
          where: { applicantId: applicant.id },
          create: {
            applicantId: applicant.id,
            cohortId,
            pathway: data.pathway || null,
            essayAnswers,
            rawImportRow: raw,
            importBatchId: batch.id,
            availabilityDeclared,
            submittedAt,
          },
          update: {
            pathway: data.pathway || null,
            essayAnswers,
            rawImportRow: raw,
            importBatchId: batch.id,
            availabilityDeclared,
            submittedAt,
          },
        });

        // Eligibility Screening Checklist — every application gets a
        // screening record the moment it exists (idempotent: re-import
        // of the same applicant is a no-op here), starting at
        // `PENDING_SCREENING`. The automatic PAM-P Application
        // Eligibility Criteria decision (`runAutomaticEligibilityDecision`)
        // runs after this transaction commits, not inside it — a
        // decision failure for one row must never roll back the
        // applicant/application data that row already saved.
        await tx.eligibilityScreening.upsert({
          where: { applicationId: application.id },
          update: {},
          create: { applicationId: application.id },
        });

        if (documents.length > 0) {
          // Re-importing the same applicant replaces that row's document
          // links rather than accumulating duplicates — scoped to only
          // the column types present in *this* row, so a document a
          // future manual-upload feature might add under some other
          // type is never touched here.
          await tx.applicationDocument.deleteMany({
            where: { applicationId: application.id, type: { in: documents.map((d) => d.type) } },
          });
          await tx.applicationDocument.createMany({
            data: documents.map((d) => ({ applicationId: application.id, ...d })),
          });
        }

        importedApplicationId = application.id;
      });
      successCount++;

      if (importedApplicationId) {
        try {
          await runAutomaticEligibilityDecision(importedApplicationId);
        } catch (error) {
          logger.error("import.automatic_eligibility_decision_failed", {
            applicationId: importedApplicationId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      rowErrors.push({
        rowNumber,
        rawData: raw,
        errorMessage: error instanceof Error ? error.message : "Unknown error while saving this row",
      });
    }
  }

  if (rowErrors.length > 0) {
    await prisma.importRowError.createMany({
      data: rowErrors.map((e) => ({
        importBatchId: batch.id,
        rowNumber: e.rowNumber,
        rawData: e.rawData,
        errorMessage: e.errorMessage,
      })),
    });
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      successCount,
      errorCount: rowErrors.length,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorId: uploadedById,
    action: AUDIT_ACTIONS.APPLICANTS_IMPORTED,
    entityType: "ImportBatch",
    entityId: batch.id,
    metadata: { fileName, totalRows: rows.length, successCount, errorCount: rowErrors.length },
  });

  return {
    batchId: batch.id,
    totalRows: rows.length,
    successCount,
    errorCount: rowErrors.length,
    screeningsEnsured: successCount,
    errors: rowErrors.map(({ rowNumber, errorMessage }) => ({ rowNumber, errorMessage })),
  };
}
