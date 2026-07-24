"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const ALL = "ALL";

const STATUS_OPTIONS = [
  { value: "AWAITING_ASSIGNMENT", label: "Awaiting assignment" },
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "SUBMITTED", label: "Submitted" },
];

export function AssignmentMonitoringFilterBar({
  pathwayOptions,
  reviewerOptions,
}: {
  pathwayOptions: string[];
  reviewerOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleFlag(key: string) {
    updateParam(key, searchParams.get(key) === "true" ? null : "true");
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="reviewer-filter">Reviewer</Label>
          <Select
            defaultValue={searchParams.get("reviewerId") ?? ALL}
            onValueChange={(value) => updateParam("reviewerId", value)}
          >
            <SelectTrigger id="reviewer-filter">
              <SelectValue placeholder="All reviewers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All reviewers</SelectItem>
              {reviewerOptions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="status-filter">Status</Label>
          <Select
            defaultValue={searchParams.get("status") ?? ALL}
            onValueChange={(value) => updateParam("status", value)}
          >
            <SelectTrigger id="status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pathway-filter">Pathway</Label>
          <Select
            defaultValue={searchParams.get("pathway") ?? ALL}
            onValueChange={(value) => updateParam("pathway", value)}
          >
            <SelectTrigger id="pathway-filter">
              <SelectValue placeholder="All pathways" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All pathways</SelectItem>
              {pathwayOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="overdue-filter"
            checked={searchParams.get("overdueOnly") === "true"}
            onCheckedChange={() => toggleFlag("overdueOnly")}
          />
          <Label htmlFor="overdue-filter">Overdue only</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="conflict-filter"
            checked={searchParams.get("conflictOnly") === "true"}
            onCheckedChange={() => toggleFlag("conflictOnly")}
          />
          <Label htmlFor="conflict-filter">Conflict flagged only</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="third-review-filter"
            checked={searchParams.get("thirdReviewOnly") === "true"}
            onCheckedChange={() => toggleFlag("thirdReviewOnly")}
          />
          <Label htmlFor="third-review-filter">Third review only</Label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
        <div className="grid gap-1.5">
          <Label htmlFor="assigned-from">Assigned from</Label>
          <Input
            id="assigned-from"
            type="date"
            defaultValue={searchParams.get("assignedFrom") ?? ""}
            onChange={(e) => updateParam("assignedFrom", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="assigned-to">Assigned to</Label>
          <Input
            id="assigned-to"
            type="date"
            defaultValue={searchParams.get("assignedTo") ?? ""}
            onChange={(e) => updateParam("assignedTo", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
