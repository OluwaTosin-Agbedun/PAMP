"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { cancelNotificationAction, resendNotificationAction, retryNotificationAction } from "./actions";

export function NotificationRowActions({
  id,
  status,
  canManage,
}: {
  id: string;
  status: string;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (!canManage) return null;

  function run(action: () => Promise<{ success: true } | { error: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
    });
  }

  const canCancel = status === "PENDING" || status === "SCHEDULED";
  const canRetry = status === "FAILED";

  return (
    <div className="flex flex-wrap gap-1.5">
      {canRetry && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => retryNotificationAction({ id }), "Retrying notification.")}
        >
          Retry
        </Button>
      )}
      {canCancel && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => cancelNotificationAction({ id }), "Notification cancelled.")}
        >
          Cancel
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => run(() => resendNotificationAction({ id }), "A new notification has been queued.")}
      >
        Resend
      </Button>
    </div>
  );
}
