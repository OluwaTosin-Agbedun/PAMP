import { z } from "zod";

export const createAdministrativeNoteSchema = z.object({
  applicationId: z.string().min(1),
  body: z.string().trim().min(3, "Enter a note (at least 3 characters)").max(4000),
});
export type CreateAdministrativeNoteInput = z.infer<typeof createAdministrativeNoteSchema>;
