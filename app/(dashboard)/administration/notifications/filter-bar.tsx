"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { STATUS_LABELS } from "./types";

const ALL = "ALL";

export function NotificationFilterBar({ events }: { events: string[] }) {
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
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={searchParams.get("event") ?? ALL} onValueChange={(value) => updateParam("event", value)}>
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Event" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All events</SelectItem>
          {events.map((event) => (
            <SelectItem key={event} value={event}>
              {event}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        defaultValue={searchParams.get("search") ?? ""}
        placeholder="Search applicant, email or user…"
        className="w-full sm:w-64"
        onChange={(event) => updateParam("search", event.target.value)}
      />
    </div>
  );
}
