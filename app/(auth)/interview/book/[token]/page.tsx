import type { Metadata } from "next";
import Image from "next/image";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { getBookingPageData } from "@/modules/interviews/services/schedulingService";

import { BookingStatusCard, SlotPicker } from "./slot-picker";

export const metadata: Metadata = {
  title: "Book your interview — PAM-P FMS",
};

export default async function InterviewBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let data;
  try {
    data = await getBookingPageData(token);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle>Link invalid or expired</CardTitle>
            <CardDescription>
              This interview booking link is no longer valid. Please contact the Programme Secretariat for a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }
    throw error;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <Image src="/pamp-logo.jpeg" alt="PAM-P" width={48} height={48} className="mb-2 size-12 rounded-full object-cover" />
        <CardTitle>Book your interview</CardTitle>
        <CardDescription>
          Hi {data.applicantName}, choose a {data.durationMinutes}-minute interview slot below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.bookingStatus === "SLOTS_PUBLISHED" ? (
          data.candidateSlots.length > 0 ? (
            <SlotPicker token={token} slots={data.candidateSlots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }))} />
          ) : (
            <p className="text-muted-foreground text-sm">No interview slots are currently available. Please check back soon.</p>
          )
        ) : (
          <BookingStatusCard status={data.bookingStatus as "AWAITING_SLOTS" | "PENDING_CONFIRMATION" | "CONFIRMED" | "DECLINED"} />
        )}
      </CardContent>
    </Card>
  );
}
