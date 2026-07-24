import { describe, expect, it } from "vitest";

import { buildPasswordSchema, getChangePasswordSchema, loginSchema, type PasswordPolicy } from "@/lib/validation/auth";
import { accountStatusSchema, getCreateUserSchema, getResetPasswordSchema } from "@/lib/validation/user";

// Release 1.5: the default policy, matching lib/settings/registry.ts's
// `security.password_*` defaults exactly — buildPasswordSchema is pure,
// so these tests don't need a database. The async get*Schema() functions
// (below) read live SystemSetting rows and fall back to these same
// defaults when none exist, exercised separately.
const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 10,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: true,
};

describe("buildPasswordSchema", () => {
  const passwordSchema = buildPasswordSchema(DEFAULT_POLICY);

  it("accepts a password with all required character classes and min length", () => {
    expect(passwordSchema.safeParse("Correct-Horse9!").success).toBe(true);
  });

  it.each([
    ["short", "Ab1!"],
    ["no uppercase", "lowercase9!"],
    ["no lowercase", "UPPERCASE9!"],
    ["no digit", "NoDigitsHere!"],
    ["no special character", "NoSpecial9chars"],
  ])("rejects a password with %s", (_label, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it("relaxes exactly the rules a policy turns off", () => {
    const noSpecialRequired = buildPasswordSchema({ ...DEFAULT_POLICY, requireSpecial: false });
    expect(noSpecialRequired.safeParse("NoSpecial9chars").success).toBe(true);
  });

  it("enforces a configured minimum length", () => {
    const shortAllowed = buildPasswordSchema({ ...DEFAULT_POLICY, minLength: 6 });
    expect(shortAllowed.safeParse("Ab1!ok").success).toBe(true);
  });
});

describe("changePasswordSchema (live default policy)", () => {
  it("rejects when new password equals current password", async () => {
    const changePasswordSchema = await getChangePasswordSchema();
    const result = changePasswordSchema.safeParse({
      currentPassword: "Correct-Horse9!",
      newPassword: "Correct-Horse9!",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a genuinely new, valid password", async () => {
    const changePasswordSchema = await getChangePasswordSchema();
    const result = changePasswordSchema.safeParse({
      currentPassword: "Correct-Horse9!",
      newPassword: "Different-Horse7?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty current password", async () => {
    const changePasswordSchema = await getChangePasswordSchema();
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "Different-Horse7?",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("lowercases and trims the email", () => {
    const result = loginSchema.safeParse({ email: "  User@Example.COM ", password: "x" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("rejects a missing password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });
});

describe("createUserSchema (live default policy)", () => {
  it("rejects the FELLOW role (not assignable by an administrator)", async () => {
    const createUserSchema = await getCreateUserSchema();
    const result = createUserSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      role: "FELLOW",
      password: "Correct-Horse9!",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid assignable role", async () => {
    const createUserSchema = await getCreateUserSchema();
    const result = createUserSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      role: "APPLICATION_REVIEWER",
      password: "Correct-Horse9!",
    });
    expect(result.success).toBe(true);
  });
});

describe("accountStatusSchema", () => {
  it("accepts every declared AccountStatus value", () => {
    for (const status of ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_ACTIVATION", "LOCKED"]) {
      expect(accountStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects an arbitrary string", () => {
    expect(accountStatusSchema.safeParse("DELETED").success).toBe(false);
  });
});

describe("resetPasswordSchema (live default policy)", () => {
  it("enforces the same password policy as account creation", async () => {
    const resetPasswordSchema = await getResetPasswordSchema();
    expect(resetPasswordSchema.safeParse({ password: "weak" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "Correct-Horse9!" }).success).toBe(true);
  });
});
