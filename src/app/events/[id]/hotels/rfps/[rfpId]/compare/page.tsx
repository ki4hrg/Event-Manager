import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { btnOutlinedXs } from "@/lib/buttonStyles";
import { getEvent } from "@/app/events/actions";
import { getRfpComparison } from "@/app/events/rfps/actions";
import { RfpCompareView } from "@/app/events/rfps/RfpCompareView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bid comparison" };

export default async function RfpComparePage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  const [event, data] = await Promise.all([getEvent(eventId), getRfpComparison(rfpId, eventId)]);
  if (!event || !data) notFound();
  const base = `/events/${eventId}/hotels/rfps/${rfpId}`;
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Hotels", href: `/events/${eventId}/hotels` },
              { label: data.title, href: base },
              { label: "Bid comparison" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Bid comparison</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/compare/print`} className={btnOutlinedXs}>
            Print / Save PDF
          </Link>
          <a href={`/api/events/${eventId}/rfps/${rfpId}?format=docx&doc=compare`} className={btnOutlinedXs} download>
            Word
          </a>
        </div>
      </div>
      <RfpCompareView data={data} eventId={eventId} />
    </>
  );
}
