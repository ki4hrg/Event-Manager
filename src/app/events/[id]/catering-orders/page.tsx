import { notFound } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getCateringOrders, deleteCateringOrder, deleteCateringOrders, bulkUpdateCateringOrders } from "../../catering-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { CateringOrderList } from "../../catering-orders/CateringOrderList";
import { EventTabs } from "../EventTabs";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function CateringOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, cateringOrders, substatuses, responsiblePartyVendors] = await Promise.all([
    getEvent(eventId),
    getCateringOrders(eventId),
    getSubstatusOptions(),
    getResponsiblePartyVendors(eventId, "CATERING_ORDER"),
  ]);

  if (!event) notFound();

  const workflowSummaries = cateringOrders.length > 0
    ? await getWorkflowBadgeSummaries("catering_order", cateringOrders.map((o) => o.id))
    : {};

  const vendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const deleteCateringOrderAction = async (formData: FormData) => {
    "use server";
    await deleteCateringOrder(formData.get("cateringOrderId") as string, eventId);
  };

  const deleteCateringOrdersAction = async (ids: string[]) => {
    "use server";
    await deleteCateringOrders(ids, eventId);
  };

  const bulkUpdateCateringOrdersAction = async (
    ids: string[],
    updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
  ) => {
    "use server";
    await bulkUpdateCateringOrders(ids, eventId, updates);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "Catering Orders" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <CateringOrderList
        cateringOrders={cateringOrders}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        deleteCateringOrder={deleteCateringOrderAction}
        deleteCateringOrders={deleteCateringOrdersAction}
        bulkUpdateCateringOrders={bulkUpdateCateringOrdersAction}
      />
    </PageWrapper>
  );
}
