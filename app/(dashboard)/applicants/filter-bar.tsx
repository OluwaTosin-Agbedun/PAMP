"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ELIGIBILITY_LABELS, STAGE_LABELS } from "@/modules/applicants/labels";

const ALL = "ALL";

const ZONES = ["North Central", "North East", "North West", "South East", "South South", "South West"];

export function ApplicantsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            updateParam("q", String(formData.get("q") ?? ""));
          }}
        >
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Search name, email, institution…"
            className="pl-9"
          />
        </form>

        <Select
          defaultValue={searchParams.get("eligibilityStatus") ?? ALL}
          onValueChange={(value) => updateParam("eligibilityStatus", value)}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Eligibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All eligibility</SelectItem>
            {Object.entries(ELIGIBILITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue={searchParams.get("stage") ?? ALL}
          onValueChange={(value) => updateParam("stage", value)}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stages</SelectItem>
            {Object.entries(STAGE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:items-end">
        <div className="grid gap-1.5">
          <Label>Zone (region)</Label>
          <Select
            defaultValue={searchParams.get("zone") ?? ALL}
            onValueChange={(value) => updateParam("zone", value)}
          >
            <SelectTrigger className="w-full lg:w-44">
              <SelectValue placeholder="Zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All zones</SelectItem>
              {ZONES.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="state-filter">State of origin</Label>
          <Input
            id="state-filter"
            defaultValue={searchParams.get("state") ?? ""}
            placeholder="e.g. Lagos"
            className="lg:w-44"
            onBlur={(event) => updateParam("state", event.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="gender-filter">Gender</Label>
          <Input
            id="gender-filter"
            defaultValue={searchParams.get("gender") ?? ""}
            placeholder="e.g. Female"
            className="lg:w-44"
            onBlur={(event) => updateParam("gender", event.target.value)}
          />
        </div>

        <Button type="button" variant="outline" size="sm" className="w-fit self-end" onClick={clearAll}>
          Clear all filters
        </Button>
      </div>
    </div>
  );
}
