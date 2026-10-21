import type { Metadata } from "next";
import { RfpPrint } from "@/app/events/rfps/RfpPrint";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "RFP (print)" };

export default async function RfpPrintPage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  return <RfpPrint eventId={eventId} rfpId={rfpId} />;
}
