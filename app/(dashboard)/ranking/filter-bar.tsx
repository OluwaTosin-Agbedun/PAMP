"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { DECISION_BAND_LABELS } from "./types";

const ALL = "ALL";

export function RankingFilterBar({ pathways }: { pathways: string[] }) {
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
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        className="relative flex-1 sm:max-w-xs"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          updateParam("q", String(formData.get("q") ?? ""));
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input name="q" defaultValue={searchParams.get("q") ?? ""} placeholder="Search applicant name…" className="pl-9" />
      </form>

      <Select defaultValue={searchParams.get("pathway") ?? ALL} onValueChange={(value) => updateParam("pathway", value)}>
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Pathway" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All pathways</SelectItem>
          {pathways.map((pathway) => (
            <SelectItem key={pathway} value={pathway}>
              {pathway}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={searchParams.get("decisionBand") ?? ALL} onValueChange={(value) => updateParam("decisionBand", value)}>
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder="Decision band" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All decision bands</SelectItem>
          {Object.entries(DECISION_BAND_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={searchParams.get("tied") ?? ALL} onValueChange={(value) => updateParam("tied", value)}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Tie status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All candidates</SelectItem>
          <SelectItem value="true">Tied only</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
