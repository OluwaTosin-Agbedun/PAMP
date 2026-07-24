import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveCohort } from "@/lib/cohort";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { getConflictQueue } from "@/modules/reviewOperations/services/conflictQueueService";

import { WorkspaceNav } from "../workspace-nav";

export const metadata: Metadata = {
  title: "Conflicts & Recusals — PAM-P FMS",
};

const KIND_LABELS: Record<string, string> = {
  PRE_ASSIGNMENT_EXCLUSION: "Conflict of interest",
  POST_ASSIGNMENT_RECUSAL: "Recusal",
};

export default async function ConflictQueuePage() {
  const user = await requirePagePermission(PERMISSIONS.CONFLICTS_MANAGE);
  const cohort = await getActiveCohort();
  const entries = await getConflictQueue(user.id, cohort.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conflicts &amp; Recusals</h1>
        <p className="text-muted-foreground text-sm">
          Pre-assignment exclusions (never assigned) and post-assignment recusals (assigned, then stepped back).
        </p>
      </div>

      <WorkspaceNav />

      {entries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No conflicts recorded</CardTitle>
            <CardDescription>{cohort.name} has no declared conflicts of interest or recusals yet.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead>Recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant={entry.kind === "PRE_ASSIGNMENT_EXCLUSION" ? "outline" : "destructive"}>
                      {KIND_LABELS[entry.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{entry.reviewerName}</TableCell>
                  <TableCell>
                    <Link href={`/review-operations/assignments/${entry.applicationId}`} className="hover:underline">
                      {entry.applicantName}
                      <span className="text-muted-foreground block text-xs">{entry.applicationNumber}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-64 text-xs">{entry.reason ?? "—"}</TableCell>
                  <TableCell className="text-xs">{entry.declaredByName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{new Date(entry.recordedAt).toLocaleString("en-GB")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
