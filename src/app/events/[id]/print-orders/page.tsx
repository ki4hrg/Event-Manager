import { notFound } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getPrintOrders, deletePrintOrder, deletePrintOrders, bulkUpdatePrintOrders } from "../../print-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getFunctionOptions } from "../../functions/actions";
import { PrintOrderList } from "../../print-orders/PrintOrderList";
import { EventTabs } from "../EventTabs";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function PrintOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, printOrders, substatuses, responsiblePartyVendors, functions] = await Promise.all([
    getEvent(eventId),
    getPrintOrders(eventId),
    getSubstatusOptions(),
    getResponsiblePartyVendors(eventId, "PRINT_ORDER"),
    getFunctionOptions(eventId),
  ]);

  if (!event) notFound();

  const workflowSummaries = printOrders.length > 0
    ? await getWorkflowBadgeSummaries("print_order", printOrders.map((o) => o.id))
    : {};

  const vendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const deletePrintOrderAction = async (formData: FormData) => {
    "use server";
    await deletePrintOrder(formData.get("printOrderId") as string, eventId);
  };

  const deletePrintOrdersAction = async (ids: string[]) => {
    "use server";
    await deletePrintOrders(ids, eventId);
  };

  const bulkUpdatePrintOrdersAction = async (
    ids: string[],
    updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string; functionId?: string }
  ) => {
    "use server";
    await bulkUpdatePrintOrders(ids, eventId, updates);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Print Orders" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <PrintOrderList
        printOrders={printOrders}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        functions={functions}
        deletePrintOrder={deletePrintOrderAction}
        deletePrintOrders={deletePrintOrdersAction}
        bulkUpdatePrintOrders={bulkUpdatePrintOrdersAction}
      />
    </PageWrapper>
  );
}
