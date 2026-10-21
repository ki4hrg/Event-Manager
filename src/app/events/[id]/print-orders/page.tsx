import type { Metadata } from "next";
import { OpenFormLinkButton } from "../../forms/OpenFormLinkButton";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getPrintOrders, deletePrintOrder, deletePrintOrders, bulkUpdatePrintOrders } from "../../print-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { getHiddenColumns } from "@/app/events/table-columns-actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getFunctionOptions } from "../../functions/actions";
import { PrintOrderList } from "../../print-orders/PrintOrderList";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Print orders" };

export default async function PrintOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; vendor?: string; function?: string; linked?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, vendor: initialVendor, function: initialFunction, linked: initialLinked } = (await searchParams) ?? {};
  const [event, printOrders, substatuses, responsiblePartyVendors, functions, hiddenColumns] = await Promise.all([
    getEvent(eventId),
    getPrintOrders(eventId),
    getSubstatusOptions(),
    getResponsiblePartyVendors(eventId, "PRINT_ORDER"),
    getFunctionOptions(eventId),
    getHiddenColumns("print_orders"),
  ]);

  if (!event) notFound();

  const workflowSummaries = printOrders.length > 0
    ? await getWorkflowBadgeSummaries("print_order", printOrders.map((o) => o.id), eventId)
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
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
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
        <OpenFormLinkButton eventId={eventId} formType="ITEM_REQUEST" title="Item request link" />
      </div>


      <PrintOrderList
        printOrders={printOrders}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        functions={functions}
        initialStatus={initialStatus}
        initialVendor={initialVendor}
        initialFunction={initialFunction}
        initialLinked={initialLinked}
        initialHiddenColumns={hiddenColumns}
        deletePrintOrder={deletePrintOrderAction}
        deletePrintOrders={deletePrintOrdersAction}
        bulkUpdatePrintOrders={bulkUpdatePrintOrdersAction}
      />
    </>
  );

}
