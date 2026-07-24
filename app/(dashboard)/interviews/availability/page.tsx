import type { Metadata } from "next";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { listMyAvailability } from "@/modules/interviews/services/schedulingService";

import { AvailabilityForm } from "./availability-form";

export const metadata: Metadata = {
  title: "Interview Availability — PAM-P FMS",
};

export default async function InterviewAvailabilityPage() {
  const user = await requirePagePermission(PERMISSIONS.INTERVIEW_AVAILABILITY_MANAGE);

  // V1.0 runs exactly one active cohort at a time — the same assumption
  // modules/reviews/services/reviewService.ts's createReview makes for
  // "the" active review stage.
  const cohort = await prisma.cohort.findFirst({ where: { isActive: true } });

  if (!cohort) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No active cohort</CardTitle>
          <CardDescription>There is no active cohort to submit interview availability for yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows = await listMyAvailability(user.id, cohort.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interview Availability</h1>
        <p className="text-muted-foreground text-sm">{cohort.name}</p>
      </div>
      <AvailabilityForm
        cohortId={cohort.id}
        initialRows={rows.map((r) => ({
          id: r.id,
          type: r.type,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          reason: r.reason,
        }))}
      />
    </div>
  );
}
