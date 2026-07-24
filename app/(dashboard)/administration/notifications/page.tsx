import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { ALL_NOTIFICATION_EVENTS } from "@/modules/notifications/eventCatalogue";
import { listNotifications } from "@/modules/notifications/services/notificationService";

import { NotificationFilterBar } from "./filter-bar";
import { NotificationRowActions } from "./row-actions";
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from "./types";

export const metadata: Metadata = {
  title: "Notification Delivery — PAM-P FMS",
};

export default async function NotificationDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePagePermission(PERMISSIONS.NOTIFICATIONS_ADMINISTER);
  const params = await searchParams;
  const canManage = permissionsForRole(user.role).includes(PERMISSIONS.NOTIFICATIONS_ADMINISTER);

  const notifications = await listNotifications(user.id, {
    status: params.status as never,
    event: params.event,
    search: params.search,
  });

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notification Delivery</h1>
          <p className="text-muted-foreground text-sm">
            Every outbound notification — pending, sent, or failed. Nothing here is ever silently dropped.
          </p>
        </div>
        <Link href="/administration/notifications/templates" className="text-primary text-sm hover:underline">
          Manage templates →
        </Link>
      </div>

      <NotificationFilterBar events={ALL_NOTIFICATION_EVENTS.map((e) => e.key)} />

      {notifications.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to show</CardTitle>
            <CardDescription>No notifications match the current filters.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => {
                const recipientName =
                  n.recipientType === "APPLICANT" && n.applicant
                    ? `${n.applicant.firstName} ${n.applicant.lastName}`
                    : (n.user?.name ?? "—");
                return (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.event}</TableCell>
                    <TableCell>
                      <div>{recipientName}</div>
                      <div className="text-muted-foreground text-xs">{n.recipientEmail}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[n.status]}>{STATUS_LABELS[n.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-72 text-xs">
                      {n.status === "FAILED" || n.status === "RETRYING" ? (n.failureReason ?? "—") : (n.sentAt ? `Sent ${new Date(n.sentAt).toLocaleString("en-GB")}` : "—")}
                      {n.retryCount > 0 && <span className="ml-1">({n.retryCount} attempt{n.retryCount === 1 ? "" : "s"})</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(n.createdAt).toLocaleString("en-GB")}</TableCell>
                    <TableCell className="text-right">
                      <NotificationRowActions id={n.id} status={n.status} canManage={canManage} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
