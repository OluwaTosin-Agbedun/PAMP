"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "ALL";

const STAGE_OPTIONS = ["IMPORTED", "UNDER_REVIEW", "INTERVIEW", "COMMITTEE_REVIEW", "EXECUTIVE_APPROVAL", "ADMISSIONS", "CLOSED"];
const ELIGIBILITY_OPTIONS = ["PENDING", "ELIGIBLE", "INELIGIBLE", "CLARIFICATION_REQUIRED", "DISQUALIFIED"];
const ZONES = ["North Central", "North East", "North West", "South East", "South South", "South West"];

/** §7.7 Dashboard Filters — every control here writes straight to the URL's query string, which the server page reads on the next render to re-run every category's aggregation with the new filter applied. `sector` is deliberately absent — no `sector` value exists anywhere in the data model to filter by. */
export function AnalyticsFilterBar({ reviewers, panellists }: { reviewers: { id: string; name: string }[]; panellists: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="grid gap-1.5">
          <Label htmlFor="dateFrom">Date from</Label>
          <Input
            id="dateFrom"
            type="date"
            defaultValue={searchParams.get("dateFrom")?.slice(0, 10) ?? ""}
            onChange={(e) => updateParam("dateFrom", e.target.value ? new Date(e.target.value).toISOString() : "")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dateTo">Date to</Label>
          <Input
            id="dateTo"
            type="date"
            defaultValue={searchParams.get("dateTo")?.slice(0, 10) ?? ""}
            onChange={(e) => updateParam("dateTo", e.target.value ? new Date(e.target.value).toISOString() : "")}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Stage</Label>
          <Select defaultValue={searchParams.get("stage") ?? ALL} onValueChange={(v) => updateParam("stage", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All stages</SelectItem>
              {STAGE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Eligibility status</Label>
          <Select defaultValue={searchParams.get("eligibilityStatus") ?? ALL} onValueChange={(v) => updateParam("eligibilityStatus", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {ELIGIBILITY_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pathway">Leadership pathway</Label>
          <Input
            id="pathway"
            defaultValue={searchParams.get("pathway") ?? ""}
            placeholder="e.g. Entrepreneurship & Enterprise"
            onBlur={(e) => updateParam("pathway", e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" defaultValue={searchParams.get("state") ?? ""} onBlur={(e) => updateParam("state", e.target.value)} />
        </div>

        <div className="grid gap-1.5">
          <Label>Zone (region)</Label>
          <Select defaultValue={searchParams.get("zone") ?? ALL} onValueChange={(v) => updateParam("zone", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All zones</SelectItem>
              {ZONES.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="gender">Gender</Label>
          <Input id="gender" defaultValue={searchParams.get("gender") ?? ""} onBlur={(e) => updateParam("gender", e.target.value)} />
        </div>

        <div className="grid gap-1.5">
          <Label>Reviewer</Label>
          <Select defaultValue={searchParams.get("reviewerId") ?? ALL} onValueChange={(v) => updateParam("reviewerId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Reviewer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All reviewers</SelectItem>
              {reviewers.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Interview panellist</Label>
          <Select defaultValue={searchParams.get("panellistId") ?? ALL} onValueChange={(v) => updateParam("panellistId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Panellist" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All panellists</SelectItem>
              {panellists.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={clearAll}>
        Clear all filters
      </Button>
    </div>
  );
}
