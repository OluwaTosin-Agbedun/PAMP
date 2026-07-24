"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProgrammeConfigViewModel } from "@/modules/configuration/types";

import { updateCohortAction, updateProgrammeAction } from "../actions";

/** ISO datetime → the value a `datetime-local` input expects. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export function ProgrammeCohortForm({ config, canManage }: { config: ProgrammeConfigViewModel; canManage: boolean }) {
  const [name, setName] = useState(config.programmeName);
  const [code, setCode] = useState(config.programmeCode ?? "");
  const [cohortName, setCohortName] = useState(config.cohortName);
  const [cohortYear, setCohortYear] = useState(String(config.cohortYear));
  const [opensAt, setOpensAt] = useState(toLocalInputValue(config.applicationOpensAt));
  const [closesAt, setClosesAt] = useState(toLocalInputValue(config.applicationClosesAt));
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const programmeResult = await updateProgrammeAction(config.programmeId, { name, code: code || undefined });
      if ("error" in programmeResult) {
        toast.error(programmeResult.error);
        return;
      }

      const cohortResult = await updateCohortAction(config.cohortId, config.programmeId, {
        name: cohortName,
        year: Number(cohortYear),
        applicationOpensAt: opensAt ? new Date(opensAt).toISOString() : null,
        applicationClosesAt: closesAt ? new Date(closesAt).toISOString() : null,
      });
      if ("error" in cohortResult) {
        toast.error(cohortResult.error);
        return;
      }

      toast.success("Programme configuration updated.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Programme and cohort</CardTitle>
        <CardDescription>Identity fields and the application intake window.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="programme-name">Programme name</Label>
          <Input id="programme-name" value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="programme-code">Programme code</Label>
          <Input id="programme-code" value={code} disabled={!canManage} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PAM-P-2026" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cohort-name">Cohort name</Label>
          <Input id="cohort-name" value={cohortName} disabled={!canManage} onChange={(e) => setCohortName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cohort-year">Cohort year</Label>
          <Input id="cohort-year" type="number" value={cohortYear} disabled={!canManage} onChange={(e) => setCohortYear(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="application-opens">Application opening date</Label>
          <Input id="application-opens" type="datetime-local" value={opensAt} disabled={!canManage} onChange={(e) => setOpensAt(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="application-closes">Application closing date</Label>
          <Input id="application-closes" type="datetime-local" value={closesAt} disabled={!canManage} onChange={(e) => setClosesAt(e.target.value)} />
        </div>

        {canManage && (
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
