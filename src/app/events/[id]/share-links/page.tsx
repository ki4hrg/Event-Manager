import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { listShareLinksForEvent, revokeShareLink } from "@/app/events/share-links/actions";
import { ShareLinksTable } from "./ShareLinksTable";

export const dynamic = "force-dynamic";

export default async function ShareLinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, links] = await Promise.all([
    getEvent(eventId),
    listShareLinksForEvent(eventId),
  ]);

  if (!event) notFound();

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Share Links" },
        ]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
      </div>

      <div className="max-w-5xl">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Share Links</h2>
        <ShareLinksTable links={links} />
      </div>
    </>
  );
}
