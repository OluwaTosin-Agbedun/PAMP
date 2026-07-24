"use client";

import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/lib/rbac/roles";
import { signOutAction } from "@/lib/auth/actions";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: Role;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 rounded-md p-1 hover:bg-accent"
        >
          <Avatar className="size-[30px] bg-primary text-primary-foreground">
            <AvatarFallback className="bg-primary text-[12px] font-bold text-primary-foreground">
              {initialsFor(name) || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-[1.1] sm:block">
            <span className="block text-xs font-bold text-foreground">
              {ROLE_LABELS[role]}
            </span>
            <span className="block text-[10.5px] text-muted-foreground">{name}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="text-sm leading-none font-medium">{name}</p>
          <p className="text-muted-foreground mt-1 text-xs leading-none">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/change-password" className="flex items-center gap-2">
            <KeyRound />
            Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="flex w-full items-center gap-2 text-left">
              <LogOut />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
