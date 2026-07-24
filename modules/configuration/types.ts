import type { SettingCategory, SettingType } from "@/lib/settings/registry";
import type { ProgrammeWindowCode } from "@/lib/generated/prisma/client";

export type SettingViewModel = {
  key: string;
  category: SettingCategory;
  type: SettingType;
  label: string;
  description: string;
  value: number | boolean | string;
  default: number | boolean | string;
  min?: number;
  max?: number;
  options?: string[];
  readOnly: boolean;
};

export type ProgrammeConfigViewModel = {
  programmeId: string;
  programmeName: string;
  programmeCode: string | null;
  cohortId: string;
  cohortName: string;
  cohortYear: number;
  applicationOpensAt: string | null;
  applicationClosesAt: string | null;
  applicationReviewWindow: { reviewStageId: string; name: string; opensAt: string | null; closesAt: string | null } | null;
  windows: Record<ProgrammeWindowCode, { opensAt: string | null; closesAt: string | null }>;
};
