import type { Metadata } from "next";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { getUnroutedInbox } from "@/app/events/inbox/actions";
import { InboxList, InboxTabs } from "@/app/events/inbox/InboxList";
import { parseInboxView } from "@/app/events/inbox/views";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Unrouted mail" };

// Mail to this organization's inbox domain that named no event. Unrouted
// items are always Held; there is no Inbox tab.
export default async function UnroutedInboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = parseInboxView((await searchParams).view) === "done" ? "done" : "held";
  const items = await getUnroutedInbox(view);
  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader title="Unrouted mail" />
      <InboxTabs basePath="/inbox" view={view} only={["held", "done"]} />
      <InboxList items={items} basePath="/inbox" showRecipient empty={view === "held" ? "No unrouted mail." : "Nothing here yet."} />
    </PageWrapper>
  );
}
