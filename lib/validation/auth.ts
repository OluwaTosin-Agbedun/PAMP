import "server-only";

import { z } from "zod";

import { getBooleanSettingValue, getNumericSettingValue } from "@/lib/settings/service";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type PasswordPolicy = {
  minLength: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
};

/** Pure — takes explicit policy values so it's trivially unit-testable
 *  without a database, and so the default (pre-Release-1.5) behaviour is
 *  expressible as a plain object literal in tests. */
export function buildPasswordSchema(policy: PasswordPolicy) {
  let schema = z.string().min(policy.minLength, `Must be at least ${policy.minLength} characters long`);
  if (policy.requireLowercase) schema = schema.regex(/[a-z]/, "Must contain a lowercase letter");
  if (policy.requireUppercase) schema = schema.regex(/[A-Z]/, "Must contain an uppercase letter");
  if (policy.requireNumber) schema = schema.regex(/[0-9]/, "Must contain a number");
  if (policy.requireSpecial) schema = schema.regex(/[^a-zA-Z0-9]/, "Must contain a special character");
  return schema;
}

/**
 * Applies to passwords set by a System Administrator when provisioning an
 * account, and to self-service password changes. Release 1.5: reads the
 * live Security Configuration values (Configuration Centre) instead of
 * the fixed rules this schema used to hard-code — the defaults below
 * match those settings' registry defaults exactly, so behaviour is
 * unchanged until an administrator deliberately edits the policy.
 */
export async function getPasswordSchema() {
  const [minLength, requireLowercase, requireUppercase, requireNumber, requireSpecial] = await Promise.all([
    getNumericSettingValue("security.password_min_length"),
    getBooleanSettingValue("security.password_require_lowercase"),
    getBooleanSettingValue("security.password_require_uppercase"),
    getBooleanSettingValue("security.password_require_number"),
    getBooleanSettingValue("security.password_require_special"),
  ]);
  return buildPasswordSchema({ minLength, requireLowercase, requireUppercase, requireNumber, requireSpecial });
}

export async function getChangePasswordSchema() {
  const passwordSchema = await getPasswordSchema();
  return z
    .object({
      currentPassword: z.string().min(1, "Enter your current password"),
      newPassword: passwordSchema,
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      error: "New password must be different from your current password",
      path: ["newPassword"],
    });
}

export type ChangePasswordInput = { currentPassword: string; newPassword: string };
