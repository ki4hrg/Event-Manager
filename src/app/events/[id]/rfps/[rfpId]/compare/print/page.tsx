import type { Metadata } from "next";
import { RfpComparison } from "@/app/events/rfps/RfpComparison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Comparison (print)" };

export default async function RfpComparePrintPage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  return <RfpComparison eventId={eventId} rfpId={rfpId} print />;
}
