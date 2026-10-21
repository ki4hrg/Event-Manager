import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { hasPermission } from "@/lib/permissions";
import { getEvent } from "../../actions";
import { getEventInbox } from "../../inbox/actions";
import { InboxList, InboxTabs } from "../../inbox/InboxList";
import { parseInboxView } from "../../inbox/views";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox" };

const EMPTY = {
  inbox: "Nothing waiting.",
  held: "No held mail.",
  done: "Nothing here yet.",
} as const;

export default async function EventInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id: eventId } = await params;
  const view = parseInboxView((await searchParams).view);
  const [event, inbox, canEditEvent] = await Promise.all([
    getEvent(eventId),
    getEventInbox(eventId, view),
    hasPermission("EVENTS", "WRITE", eventId),
  ]);
  if (!event) notFound();
  const basePath = `/events/${eventId}/inbox`;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Inbox" },
        ]}
        title="Inbox"
      />
      {!event.inboxSlug && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          This event has no inbox address.
          {canEditEvent && (
            <>
              {" "}
              <Link href={`/events/${eventId}/settings#inbox`} className="text-blue-600 dark:text-blue-400 hover:underline">
                Set one up
              </Link>
            </>
          )}
        </p>
      )}
      <InboxTabs basePath={basePath} view={view} counts={inbox.counts} />
      <InboxList items={inbox.items} basePath={basePath} empty={EMPTY[view]} />
    </>
  );
}
