import type { Metadata } from "next";
import { RfpComparison } from "@/app/events/rfps/RfpComparison";
import { COMBINE_PARAM, parseCombine } from "@/lib/rfp/compare";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Comparison" };

export default async function RfpComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; rfpId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id: eventId, rfpId }, query] = await Promise.all([params, searchParams]);
  return <RfpComparison eventId={eventId} rfpId={rfpId} combine={parseCombine(query[COMBINE_PARAM])} />;
}
