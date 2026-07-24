"use client";

import { useState, useTransition } from "react";
import { KeyRound, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountStatus } from "@/lib/generated/prisma/enums";
import { ASSIGNABLE_ROLES, ROLE_LABELS, type Role } from "@/lib/rbac/roles";

import { changeUserRoleAction, resetUserPasswordAction, setUserStatusAction } from "./actions";
import { ASSIGNABLE_STATUSES, STATUS_LABELS } from "./status-labels";

export function UserRowActions({
  userId,
  status,
  role,
  isSelf,
}: {
  userId: string;
  status: AccountStatus;
  role: Role;
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);

  function changeStatus(newStatus: AccountStatus) {
    startTransition(async () => {
      try {
        await setUserStatusAction(userId, newStatus);
        toast.success(`Status changed to ${STATUS_LABELS[newStatus]}.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  function changeRole(newRole: Role) {
    startTransition(async () => {
      try {
        await changeUserRoleAction(userId, newRole);
        toast.success("Role updated.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isPending}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={isSelf}>Change status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {ASSIGNABLE_STATUSES.filter((candidate) => candidate !== status).map((candidate) => (
                <DropdownMenuItem key={candidate} onSelect={() => changeStatus(candidate)}>
                  {STATUS_LABELS[candidate]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {ASSIGNABLE_ROLES.filter((candidate) => candidate !== role).map((candidate) => (
                <DropdownMenuItem key={candidate} onSelect={() => changeRole(candidate)}>
                  {ROLE_LABELS[candidate]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="sr-only">Password</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setResetOpen(true)}>
            <KeyRound />
            Reset password
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDialog userId={userId} open={resetOpen} onOpenChange={setResetOpen} />
    </>
  );
}

function ResetPasswordDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(formData: FormData) {
    setError(undefined);
    const password = formData.get("password");
    startTransition(async () => {
      try {
        await resetUserPasswordAction(userId, String(password));
        toast.success("Password reset. The user must change it at next sign-in.");
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setError(undefined);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Share the new temporary password with the staff member through a secure channel. They
            will be required to change it at next sign-in.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="grid gap-2">
            <Label htmlFor="reset-password">New temporary password</Label>
            <Input id="reset-password" name="password" type="text" required minLength={10} />
            <p className="text-muted-foreground text-xs">
              At least 10 characters, with uppercase, lowercase, a number, and a symbol.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
