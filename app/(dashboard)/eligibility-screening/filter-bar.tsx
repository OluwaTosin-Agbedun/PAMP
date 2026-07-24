"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SCREENING_STATUS_LABELS } from "./types";

const ALL = "ALL";

export function ScreeningFilterBar({ screeners }: { screeners: { id: string; name: string }[] }) {
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
      <Select defaultValue={searchParams.get("status") ?? ALL} onValueChange={(value) => updateParam("status", value)}>
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {Object.entries(SCREENING_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={searchParams.get("screener") ?? ALL} onValueChange={(value) => updateParam("screener", value)}>
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Screener" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All screeners</SelectItem>
          <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
          {screeners.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
