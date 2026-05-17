import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getAVOrders, deleteAVOrder, deleteAVOrders, bulkUpdateAVOrders } from "../../av-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { AVOrderList } from "../../av-orders/AVOrderList";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AVOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; vendor?: string; function?: string; linked?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, vendor: initialVendor, function: initialFunction, linked: initialLinked } = (await searchParams) ?? {};
  const [event, avOrders, substatuses, responsiblePartyVendors] = await Promise.all([
    getEvent(eventId),
    getAVOrders(eventId),
    getSubstatusOptions(),
    getResponsiblePartyVendors(eventId, "AV_ORDER"),
  ]);

  if (!event) notFound();

  const workflowSummaries = avOrders.length > 0
    ? await getWorkflowBadgeSummaries("av_order", avOrders.map((o) => o.id), eventId)
    : {};

  const vendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const deleteAVOrderAction = async (formData: FormData) => {
    "use server";
    await deleteAVOrder(formData.get("avOrderId") as string, eventId);
  };

  const deleteAVOrdersAction = async (ids: string[]) => {
    "use server";
    await deleteAVOrders(ids, eventId);
  };

  const bulkUpdateAVOrdersAction = async (
    ids: string[],
    updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
  ) => {
    "use server";
    await bulkUpdateAVOrders(ids, eventId, updates);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "AV Orders" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>


      <AVOrderList
        avOrders={avOrders}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        initialStatus={initialStatus}
        initialVendor={initialVendor}
        initialFunction={initialFunction}
        initialLinked={initialLinked}
        deleteAVOrder={deleteAVOrderAction}
        deleteAVOrders={deleteAVOrdersAction}
        bulkUpdateAVOrders={bulkUpdateAVOrdersAction}
      />
    </>
  );

}
