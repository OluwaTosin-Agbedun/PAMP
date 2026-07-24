import type { Metadata } from "next";
import Link from "next/link";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { ALL_NOTIFICATION_EVENTS } from "@/modules/notifications/eventCatalogue";
import { listActiveTemplates } from "@/modules/notifications/services/notificationService";

import { TemplateList } from "./template-list";

export const metadata: Metadata = {
  title: "Notification Templates — PAM-P FMS",
};

export default async function NotificationTemplatesPage() {
  const user = await requirePagePermission(PERMISSIONS.NOTIFICATIONS_ADMINISTER);
  const canManage = permissionsForRole(user.role).includes(PERMISSIONS.NOTIFICATIONS_ADMINISTER);

  const templates = await listActiveTemplates(user.id);
  const templateByEvent = new Map(templates.map((t) => [t.event, t]));

  const rows = ALL_NOTIFICATION_EVENTS.map((definition) => ({
    definition,
    template: templateByEvent.get(definition.key) ?? null,
  }));

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/administration/notifications" className="text-primary text-sm hover:underline">
          ← Back to Notification Delivery
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Notification Templates</h1>
        <p className="text-muted-foreground text-sm">
          Every notification event and its current wording. Editing a template publishes a new version — the exact
          wording actually sent for a past notification is never rewritten.
        </p>
      </div>

      <TemplateList rows={rows} canManage={canManage} />
    </div>
  );
}
