import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  dismissInboundEmail,
  fileInboundAttachment,
  getInboxDestinationEvents,
  getInboxItem,
  releaseInboundEmail,
  restoreInboundEmail,
  routeInboundEmail,
} from "../../../inbox/actions";
import { InboxItemView } from "../../../inbox/InboxItemView";
import { FileAttachmentButton, InboxItemActions } from "../../../inbox/InboxItemActions";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox item" };

export default async function EventInboxItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: eventId, itemId } = await params;
  const [event, item, canWrite] = await Promise.all([
    getEvent(eventId),
    getInboxItem(itemId, eventId),
    hasPermission("HOTELS", "WRITE", eventId),
  ]);
  if (!event || !item) notFound();
  const destinations = canWrite ? await getInboxDestinationEvents(eventId) : [];

  const release = async () => {
    "use server";
    await releaseInboundEmail(itemId, eventId);
  };
  const dismiss = async () => {
    "use server";
    await dismissInboundEmail(itemId, eventId);
  };
  const restore = async () => {
    "use server";
    await restoreInboundEmail(itemId, eventId);
  };
  const move = async (toEventId: string) => {
    "use server";
    await routeInboundEmail(itemId, eventId, toEventId);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Inbox", href: `/events/${eventId}/inbox` },
          { label: item.subject || "(no subject)" },
        ]}
        title={item.subject || "(no subject)"}
        actions={
          <InboxItemActions
            status={item.status}
            routed
            destinations={destinations}
            release={release}
            dismiss={dismiss}
            restore={restore}
            move={move}
          />
        }
      />
      <InboxItemView
        item={item}
        timezone={event.timezone}
        renderFileAction={(f) => {
          const file = async () => {
            "use server";
            await fileInboundAttachment(f.id, itemId, eventId);
          };
          return <FileAttachmentButton filed={item.filedStoredNames.includes(f.storedName)} file={file} />;
        }}
      />
    </>
  );
}
