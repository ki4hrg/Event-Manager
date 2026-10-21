import type { Metadata } from "next";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { getOrgInbox } from "@/app/events/inbox/actions";
import { InboxList, InboxTabs } from "@/app/events/inbox/InboxList";
import { ReadingRefresh } from "@/app/events/inbox/ReadingRefresh";
import { parseInboxView } from "@/app/events/inbox/views";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox" };

const EMPTY = {
  inbox: "Nothing waiting.",
  held: "No held mail.",
  done: "Nothing here yet.",
} as const;

// Every event inbox the user can see, plus mail to this organization's inbox
// domain that named no event (Unrouted, always Held). Event items open on
// their event's inbox; Unrouted ones under /inbox/[itemId].
export default async function OrgInboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = parseInboxView((await searchParams).view);
  const inbox = await getOrgInbox(view);
  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader title="Inbox" />
      <InboxTabs basePath="/inbox" view={view} counts={inbox.counts} />
      {inbox.items.some((i) => i.status === "RECEIVED") && <ReadingRefresh label={null} />}
      <InboxList items={inbox.items} basePath="/inbox" showEvent empty={EMPTY[view]} />
    </PageWrapper>
  );
}
