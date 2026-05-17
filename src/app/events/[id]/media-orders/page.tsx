import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getMediaOrders, deleteMediaOrder, deleteMediaOrders, bulkUpdateMediaOrders } from "../../media-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getFunctionOptions } from "../../functions/actions";
import { getPresentationOptions } from "../../presentations/actions";
import { MediaOrderList } from "../../media-orders/MediaOrderList";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function MediaOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; vendor?: string; function?: string; linked?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, vendor: initialVendor, function: initialFunction, linked: initialLinked } = (await searchParams) ?? {};
  const [event, mediaOrders, substatuses, responsiblePartyVendors, functions, presentations] = await Promise.all([
    getEvent(eventId),
    getMediaOrders(eventId),
    getSubstatusOptions(),
    getResponsiblePartyVendors(eventId, "MEDIA_ORDER"),
    getFunctionOptions(eventId),
    getPresentationOptions(eventId),
  ]);

  if (!event) notFound();

  const workflowSummaries = mediaOrders.length > 0
    ? await getWorkflowBadgeSummaries("media_order", mediaOrders.map((o) => o.id), eventId)
    : {};

  const vendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const deleteMediaOrderAction = async (formData: FormData) => {
    "use server";
    await deleteMediaOrder(formData.get("mediaOrderId") as string, eventId);
  };

  const deleteMediaOrdersAction = async (ids: string[]) => {
    "use server";
    await deleteMediaOrders(ids, eventId);
  };

  const bulkUpdateMediaOrdersAction = async (
    ids: string[],
    updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string; functionId?: string; presentationId?: string }
  ) => {
    "use server";
    await bulkUpdateMediaOrders(ids, eventId, updates);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Media Orders" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <MediaOrderList
        mediaOrders={mediaOrders}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        functions={functions}
        presentations={presentations}
        initialStatus={initialStatus}
        initialVendor={initialVendor}
        initialFunction={initialFunction}
        initialLinked={initialLinked}
        deleteMediaOrder={deleteMediaOrderAction}
        deleteMediaOrders={deleteMediaOrdersAction}
        bulkUpdateMediaOrders={bulkUpdateMediaOrdersAction}
      />
    </>
  );
}
