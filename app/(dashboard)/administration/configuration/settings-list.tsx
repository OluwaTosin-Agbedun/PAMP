"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { updateSettingAction } from "./actions";

export type SettingRowViewModel = {
  key: string;
  type: "number" | "boolean" | "string";
  label: string;
  description: string;
  value: number | boolean | string;
  min?: number;
  max?: number;
  options?: string[];
  readOnly: boolean;
};

/**
 * One card per setting, in-place editable, independently saved — every
 * category screen (review/interview/scoring/notification/file_upload/
 * security) renders through this one component, driven entirely by
 * `SETTINGS_REGISTRY` via `getSettingsForCategory`. A new setting is a
 * new registry entry, never a new form.
 */
export function SettingsList({ settings, canManage }: { settings: SettingRowViewModel[]; canManage: boolean }) {
  return (
    <div className="grid gap-4">
      {settings.map((setting) => (
        <SettingRow key={setting.key} setting={setting} canManage={canManage} />
      ))}
    </div>
  );
}

function SettingRow({ setting, canManage }: { setting: SettingRowViewModel; canManage: boolean }) {
  const [value, setValue] = useState(setting.value);
  const [isPending, startTransition] = useTransition();
  const editable = canManage && !setting.readOnly;

  function save(nextValue: number | boolean | string) {
    startTransition(async () => {
      const result = await updateSettingAction(setting.key, nextValue);
      if ("error" in result) {
        toast.error(result.error);
        setValue(setting.value);
        return;
      }
      setValue(nextValue);
      toast.success(`${setting.label} updated.`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{setting.label}</CardTitle>
          {setting.readOnly && <Badge variant="outline">Read-only</Badge>}
        </div>
        <CardDescription>{setting.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {setting.type === "boolean" ? (
          <div className="flex items-center gap-3">
            <Switch
              id={setting.key}
              checked={Boolean(value)}
              disabled={!editable || isPending}
              onCheckedChange={(checked) => {
                setValue(checked);
                save(checked);
              }}
              aria-label={setting.label}
            />
            <Label htmlFor={setting.key}>{Boolean(value) ? "Enabled" : "Disabled"}</Label>
          </div>
        ) : setting.type === "string" && setting.options ? (
          <Select
            value={String(value)}
            disabled={!editable || isPending}
            onValueChange={(next) => {
              setValue(next);
              save(next);
            }}
          >
            <SelectTrigger aria-label={setting.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {setting.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex max-w-sm items-center gap-2">
            <Input
              aria-label={setting.label}
              type={setting.type === "number" ? "number" : "text"}
              min={setting.min}
              max={setting.max}
              defaultValue={String(value)}
              disabled={!editable}
              onBlur={(e) => {
                const raw = e.target.value;
                const next = setting.type === "number" ? Number(raw) : raw;
                if (next !== value) save(next);
              }}
            />
            {isPending && <span className="text-muted-foreground text-xs">Saving…</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

