"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FeatureFlagKey } from "@/lib/featureFlags/service";

import { setFeatureFlagAction } from "./actions";

export type FlagViewModel = { key: string; label: string; description: string; enabled: boolean };

export function FeatureFlagList({ flags }: { flags: FlagViewModel[] }) {
  return (
    <div className="grid gap-4">
      {flags.map((flag) => (
        <FlagRow key={flag.key} flag={flag} />
      ))}
    </div>
  );
}

function FlagRow({ flag }: { flag: FlagViewModel }) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setFeatureFlagAction(flag.key as FeatureFlagKey, next);
      if ("error" in result) {
        toast.error(result.error);
        setEnabled(flag.enabled);
        return;
      }
      setEnabled(next);
      toast.success(`${flag.label} ${next ? "enabled" : "disabled"}.`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{flag.label}</CardTitle>
        <CardDescription>{flag.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch id={flag.key} checked={enabled} disabled={isPending} onCheckedChange={toggle} aria-label={flag.label} />
          <Label htmlFor={flag.key}>{enabled ? "Enabled" : "Disabled"}</Label>
        </div>
      </CardContent>
    </Card>
  );
}
