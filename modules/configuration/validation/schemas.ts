import { z } from "zod";

export const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.number(), z.boolean(), z.string()]),
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

export const updateProgrammeSchema = z.object({
  name: z.string().trim().min(1, "Programme name is required").max(200),
  code: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type UpdateProgrammeInput = z.infer<typeof updateProgrammeSchema>;

export const updateCohortSchema = z.object({
  name: z.string().trim().min(1, "Cohort name is required").max(200),
  year: z.coerce.number().int().min(2000).max(2100),
  applicationOpensAt: z.string().datetime().optional().nullable(),
  applicationClosesAt: z.string().datetime().optional().nullable(),
});
export type UpdateCohortInput = z.infer<typeof updateCohortSchema>;

export const updateProgrammeWindowSchema = z.object({
  code: z.enum(["ELIGIBILITY_REVIEW", "INTERVIEW", "EXECUTIVE_APPROVAL", "OFFER"]),
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
});
export type UpdateProgrammeWindowInput = z.infer<typeof updateProgrammeWindowSchema>;

export const updateApplicationReviewWindowSchema = z.object({
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
});
export type UpdateApplicationReviewWindowInput = z.infer<typeof updateApplicationReviewWindowSchema>;
