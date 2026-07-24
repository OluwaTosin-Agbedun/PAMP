import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { ROLE_LABELS } from "@/lib/rbac/roles";

import { CreateUserDialog } from "./create-user-dialog";
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from "./status-labels";
import { UserRowActions } from "./user-row-actions";

export const metadata: Metadata = {
  title: "Users — PAM-P FMS",
};

export default async function UsersPage() {
  const currentUser = await requirePagePermission(PERMISSIONS.USERS_VIEW);
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm">Provision and manage staff accounts.</p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[user.status]}>
                    {STATUS_LABELS[user.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.lastLoginAt ? user.lastLoginAt.toLocaleString("en-GB") : "Never"}
                </TableCell>
                <TableCell>
                  <UserRowActions
                    userId={user.id}
                    status={user.status}
                    role={user.role}
                    isSelf={user.id === currentUser.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
