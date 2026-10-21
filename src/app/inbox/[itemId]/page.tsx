import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { hasPermission } from "@/lib/permissions";
import { canSeeDiagnostics } from "@/lib/tenant";
import {
  dismissInboundEmail,
  getInboxDestinationEvents,
  getInboxItem,
  restoreInboundEmail,
  routeInboundEmail,
} from "@/app/events/inbox/actions";
import { InboxItemView } from "@/app/events/inbox/InboxItemView";
import { InboxItemActions } from "@/app/events/inbox/InboxItemActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Unrouted mail" };

export default async function UnroutedInboxItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const [item, canWrite, diagnostics] = await Promise.all([
    getInboxItem(itemId, null),
    hasPermission("HOTELS", "WRITE"),
    canSeeDiagnostics(),
  ]);
  if (!item) notFound();
  const destinations = canWrite ? await getInboxDestinationEvents(null) : [];

  const dismiss = async () => {
    "use server";
    await dismissInboundEmail(itemId, null);
  };
  const restore = async () => {
    "use server";
    await restoreInboundEmail(itemId, null);
  };
  const route = async (toEventId: string) => {
    "use server";
    await routeInboundEmail(itemId, null, toEventId);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[{ label: "Unrouted mail", href: "/inbox" }, { label: item.subject || "(no subject)" }]}
        title={item.subject || "(no subject)"}
        actions={
          canWrite ? (
            <InboxItemActions
              status={item.status}
              routed={false}
              destinations={destinations}
              dismiss={dismiss}
              restore={restore}
              move={route}
            />
          ) : null
        }
      />
      <InboxItemView item={item} diagnostics={diagnostics} />
    </PageWrapper>
  );
}
