"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CORE_FIELDS, findDuplicateMappings, type ColumnMapping, type ColumnTarget } from "@/modules/import/mapping";
import type { ImportSummary } from "@/modules/import/service";

import { commitImportAction, parseImportFileAction } from "./actions";

type Step = "upload" | "mapping" | "result";

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [pathname, setPathname] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handleUpload(file: File) {
    setError(undefined);
    startTransition(async () => {
      let blobPathname: string;
      try {
        const blob = await upload(file.name, file, {
          access: "private",
          handleUploadUrl: "/api/import/blob-upload",
        });
        blobPathname = blob.pathname;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
        return;
      }

      const result = await parseImportFileAction({ pathname: blobPathname, fileName: file.name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFileName(file.name);
      setPathname(result.pathname);
      setHeaders(result.headers);
      setPreviewRows(result.previewRows);
      setRowCount(result.rowCount);
      setMapping(result.suggestedMapping);
      setStep("mapping");
    });
  }

  function handleCommit() {
    setError(undefined);
    startTransition(async () => {
      const result = await commitImportAction({ fileName, pathname, columnMapping: mapping });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSummary(result.summary);
      setStep("result");
      toast.success("Import complete.");
    });
  }

  if (step === "upload") {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Upload applicant file</CardTitle>
          <CardDescription>
            Accepts .xlsx or .csv exported from the application portal. You&apos;ll map columns to
            fields on the next step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const file = fileInputRef.current?.files?.[0];
              if (!file) return;
              handleUpload(file);
            }}
            className="grid gap-4"
          >
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".xlsx,.xls,.csv"
              required
              className="text-sm"
            />
            <Button type="submit" disabled={isPending} className="w-fit">
              <Upload />
              {isPending ? "Uploading…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (step === "mapping") {
    const duplicates = findDuplicateMappings(mapping);
    const fieldLabel = (key: string) => CORE_FIELDS.find((f) => f.key === key)?.label ?? key;

    return (
      <div className="grid gap-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {duplicates.length > 0 && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Multiple columns map to the same field</AlertTitle>
            <AlertDescription>
              <ul className="grid gap-1">
                {duplicates.map((d) => (
                  <li key={d.field}>
                    <span className="font-medium">{fieldLabel(d.field)}</span>: {d.headers.join(", ")}
                  </li>
                ))}
              </ul>
              Each field can only come from one column — reassign the extra ones above to &quot;Keep as additional
              data&quot; or &quot;Ignore this column&quot; before importing.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
            <CardDescription>
              {fileName} — {rowCount} row{rowCount === 1 ? "" : "s"}. Unmapped columns
              are kept as additional data on the applicant&apos;s record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {headers.map((header) => (
                <div key={header} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_240px]">
                  <span className="text-sm font-medium">{header}</span>
                  <Select
                    value={mapping[header] ?? "EXTRA"}
                    onValueChange={(value: ColumnTarget) =>
                      setMapping((prev) => ({ ...prev, [header]: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CORE_FIELDS.map((field) => (
                        <SelectItem key={field.key} value={field.key}>
                          {field.label}
                          {field.required ? " *" : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value="EXTRA">Keep as additional data</SelectItem>
                      <SelectItem value="IGNORE">Ignore this column</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>First {previewRows.length} rows, as they&apos;ll be read.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, index) => (
                    <TableRow key={index}>
                      {headers.map((header) => (
                        <TableCell key={header}>{row[header] || "—"}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep("upload")} disabled={isPending}>
            Back
          </Button>
          <Button onClick={handleCommit} disabled={isPending || duplicates.length > 0}>
            {isPending ? "Importing…" : `Import ${rowCount} rows`}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "result" && summary) {
    return (
      <div className="grid max-w-xl gap-6">
        <Alert variant={summary.errorCount === 0 ? "default" : "destructive"}>
          {summary.errorCount === 0 ? <CheckCircle2 /> : <XCircle />}
          <AlertTitle>
            {summary.successCount} imported, {summary.errorCount} failed
          </AlertTitle>
          <AlertDescription>
            {summary.screeningsEnsured} application{summary.screeningsEnsured === 1 ? "" : "s"} entered Pending
            Screening — an authorised screener must complete the Eligibility Screening Checklist before any of them
            can proceed to Application Review.
          </AlertDescription>
        </Alert>

        {summary.errors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Rows that need attention</CardTitle>
              <CardDescription>Fix these in your source file and re-upload to retry just these rows.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="max-h-64 grid gap-2 overflow-y-auto text-sm">
                {summary.errors.map((rowError) => (
                  <li key={rowError.rowNumber}>
                    <span className="font-medium">Row {rowError.rowNumber}:</span> {rowError.errorMessage}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button asChild>
            <Link href="/applicants">View applicants</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setStep("upload");
              setSummary(null);
              setHeaders([]);
              setPathname("");
              setRowCount(0);
            }}
          >
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
