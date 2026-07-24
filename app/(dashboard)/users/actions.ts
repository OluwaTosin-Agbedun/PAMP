"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, ValidationError } from "@/lib/errors";
import { handleActionError } from "@/lib/errors/handleAction";
import { AccountStatus } from "@/lib/generated/prisma/enums";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requireActionPermission } from "@/lib/permissions/guard";
import { Role } from "@/lib/rbac/roles";
import { accountStatusSchema, getCreateUserSchema, getResetPasswordSchema } from "@/lib/validation/user";

export type CreateUserState = { error?: string; success?: boolean };

export async function createUserAction(
  _prevState: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  // Deliberately outside the try/catch below: requireActionPermission
  // redirects (via Next's thrown NEXT_REDIRECT signal) on denial, and
  // must never be swallowed into a generic error by handleActionError.
  const actor = await requireActionPermission(PERMISSIONS.USERS_CREATE);

  try {
    const createUserSchema = await getCreateUserSchema();
    const parsed = createUserSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { name, email, role, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError("A user with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: role as Role,
        passwordHash,
        createdById: actor.id,
        mustChangePassword: true,
      },
    });

    await writeAuditLog({
      actorId: actor.id,
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role },
    });

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "users.create");
  }
}

export async function setUserStatusAction(userId: string, status: AccountStatus) {
  const actor = await requireActionPermission(PERMISSIONS.USERS_MANAGE_STATUS);

  const parsed = accountStatusSchema.safeParse(status);
  if (!parsed.success) {
    throw new ValidationError("Select a valid account status.");
  }

  if (userId === actor.id && status !== AccountStatus.ACTIVE) {
    throw new ValidationError("You cannot change your own account status.");
  }

  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (target.role === Role.SYSTEM_ADMIN && status !== AccountStatus.ACTIVE) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: Role.SYSTEM_ADMIN, status: AccountStatus.ACTIVE, id: { not: userId } },
    });
    if (otherActiveAdmins === 0) {
      throw new ValidationError("At least one active System Administrator is required.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { status } });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
    entityType: "User",
    entityId: userId,
    metadata: { from: target.status, to: status },
  });

  revalidatePath("/users");
}

export async function changeUserRoleAction(userId: string, role: Role) {
  const actor = await requireActionPermission(PERMISSIONS.USERS_MANAGE_ROLES);

  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (target.role === Role.SYSTEM_ADMIN && role !== Role.SYSTEM_ADMIN) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: Role.SYSTEM_ADMIN, status: AccountStatus.ACTIVE, id: { not: userId } },
    });
    if (otherActiveAdmins === 0) {
      throw new ValidationError("At least one active System Administrator is required.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: "User",
    entityId: userId,
    metadata: { from: target.role, to: role },
  });

  revalidatePath("/users");
}

export async function resetUserPasswordAction(userId: string, password: string) {
  const actor = await requireActionPermission(PERMISSIONS.USERS_RESET_PASSWORD);

  const resetPasswordSchema = await getResetPasswordSchema();
  const parsed = resetPasswordSchema.safeParse({ password });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid password.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/users");
}
