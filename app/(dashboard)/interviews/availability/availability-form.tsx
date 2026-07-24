"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { removeAvailabilityAction, submitAvailabilityAction } from "./actions";

type AvailabilityType = "AVAILABLE" | "UNAVAILABLE" | "LEAVE";

type AvailabilityRow = {
  id: string;
  type: AvailabilityType;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

const TYPE_LABELS: Record<AvailabilityType, string> = {
  AVAILABLE: "Available",
  UNAVAILABLE: "Unavailable",
  LEAVE: "Leave",
};

const TYPE_BADGE_VARIANT: Record<AvailabilityType, "default" | "secondary" | "destructive"> = {
  AVAILABLE: "default",
  UNAVAILABLE: "secondary",
  LEAVE: "destructive",
};

export function AvailabilityForm({ cohortId, initialRows }: { cohortId: string; initialRows: AvailabilityRow[] }) {
  const [type, setType] = useState<AvailabilityType>("AVAILABLE");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [isRemoving, startRemove] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSubmit(async () => {
      const result = await submitAvailabilityAction({
        cohortId,
        type,
        startsAt: startsAt ? new Date(startsAt).toISOString() : "",
        endsAt: endsAt ? new Date(endsAt).toISOString() : "",
        reason: reason.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        toast.error("Couldn't save availability.", { description: result.error });
        return;
      }
      toast.success("Availability saved.");
      setStartsAt("");
      setEndsAt("");
      setReason("");
    });
  }

  function handleRemove(id: string) {
    startRemove(async () => {
      const result = await removeAvailabilityAction(id);
      if ("error" in result) {
        toast.error("Couldn't remove that entry.", { description: result.error });
      }
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add availability</CardTitle>
          <CardDescription>
            Submit windows when you&apos;re available, unavailable, or on leave for this cohort&apos;s interview period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2 sm:max-w-60">
              <Label htmlFor="availability-type">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as AvailabilityType)}>
                <SelectTrigger id="availability-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="UNAVAILABLE">Unavailable</SelectItem>
                  <SelectItem value="LEAVE">Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="starts-at">Starts</Label>
                <Input id="starts-at" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ends-at">Ends</Label>
                <Input id="ends-at" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
              </div>
            </div>

            {type !== "AVAILABLE" && (
              <div className="grid gap-2">
                <Label htmlFor="reason">
                  Reason<span className="text-destructive ml-1" aria-hidden="true">*</span>
                </Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-required required />
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={isSubmitting} className="sm:w-fit">
              {isSubmitting ? "Saving…" : "Add availability"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your submitted availability</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {initialRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing submitted yet.</p>
          ) : (
            initialRows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={TYPE_BADGE_VARIANT[row.type]}>{TYPE_LABELS[row.type]}</Badge>
                    <span className="text-sm">
                      {new Date(row.startsAt).toLocaleString("en-GB")} – {new Date(row.endsAt).toLocaleString("en-GB")}
                    </span>
                  </div>
                  {row.reason && <p className="text-muted-foreground mt-1 text-xs">{row.reason}</p>}
                </div>
                <Button type="button" variant="outline" size="sm" disabled={isRemoving} onClick={() => handleRemove(row.id)}>
                  Remove
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
