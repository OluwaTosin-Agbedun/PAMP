"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { bookSlotAction } from "./actions";

type SlotViewModel = { id: string; startsAt: string; endsAt: string };

export function SlotPicker({ token, slots }: { token: string; slots: SlotViewModel[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selectedId) {
      setError("Choose a slot first.");
      return;
    }
    startTransition(async () => {
      const result = await bookSlotAction({ token, slotId: selectedId });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div role="radiogroup" aria-label="Available interview slots" className="grid gap-2">
        {slots.map((slot) => {
          const id = `slot-${slot.id}`;
          return (
            <label
              key={slot.id}
              htmlFor={id}
              className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                id={id}
                type="radio"
                name="slot"
                value={slot.id}
                checked={selectedId === slot.id}
                onChange={() => setSelectedId(slot.id)}
              />
              <span>
                {new Date(slot.startsAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                {" · "}
                {new Date(slot.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} –{" "}
                {new Date(slot.endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={isSubmitting || !selectedId}>
        {isSubmitting ? "Booking…" : "Book this slot"}
      </Button>
    </form>
  );
}

export function BookingStatusCard({ status }: { status: "PENDING_CONFIRMATION" | "CONFIRMED" | "DECLINED" | "AWAITING_SLOTS" }) {
  const copy: Record<typeof status, { title: string; description: string }> = {
    AWAITING_SLOTS: {
      title: "Slots not published yet",
      description: "Your interview slots haven't been published yet. Please check back soon.",
    },
    PENDING_CONFIRMATION: {
      title: "Booking submitted",
      description: "Thank you — your requested interview time has been submitted and is awaiting confirmation from the Programme Secretariat.",
    },
    CONFIRMED: {
      title: "Interview confirmed",
      description: "Your interview has been confirmed. You'll receive an invitation with the meeting details separately.",
    },
    DECLINED: {
      title: "Please choose another slot",
      description: "The Programme Secretariat has asked you to choose a different interview time. Refresh this page to see available slots.",
    },
  };
  const { title, description } = copy[status];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}
