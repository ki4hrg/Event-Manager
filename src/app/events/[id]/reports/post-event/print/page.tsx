import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getPostEventReportData } from "@/app/events/reports/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { PostEventReport } from "../PostEventReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Post-Event Report (print)" };

export default async function PostEventReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blank?: string }>;
}) {
  const { id: eventId } = await params;
  const { blank } = await searchParams;
  const [event, doc] = await Promise.all([getEvent(eventId), getPostEventReportData(eventId, { showBlank: blank === "1" })]);
  if (!event || !doc) notFound();
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PrintHeader
        eventName={event.name}
        title="Post-Event Report"
        backHref={`/events/${eventId}/reports/post-event${blank === "1" ? "?blank=1" : ""}`}
      />
      <PostEventReport doc={doc} />
    </div>
  );
}
