import "server-only";

import { z } from "zod";

import { AccountStatus } from "@/lib/generated/prisma/enums";
import { ASSIGNABLE_ROLES } from "@/lib/rbac/roles";
import { getPasswordSchema } from "./auth";

const assignableRoleValues = ASSIGNABLE_ROLES as string[];
const accountStatusValues = Object.values(AccountStatus) as string[];

export async function getCreateUserSchema() {
  const passwordSchema = await getPasswordSchema();
  return z.object({
    name: z.string().trim().min(2, "Enter the staff member's full name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    role: z.string().refine((value) => assignableRoleValues.includes(value), {
      error: "Select a valid role",
    }),
    password: passwordSchema,
  });
}

export type CreateUserInput = { name: string; email: string; role: string; password: string };

export const accountStatusSchema = z.string().refine((value) => accountStatusValues.includes(value), {
  error: "Select a valid account status",
});

export async function getResetPasswordSchema() {
  const passwordSchema = await getPasswordSchema();
  return z.object({ password: passwordSchema });
}

export type ResetPasswordInput = { password: string };
