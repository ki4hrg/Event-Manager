import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getSetupOrders, deleteSetupOrder, deleteSetupOrders, bulkUpdateSetupOrders } from "../../setup-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { SetupOrderList } from "../../setup-orders/SetupOrderList";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function SetupOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; vendor?: string; function?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, vendor: initialVendor, function: initialFunction } = (await searchParams) ?? {};
  const [event, setupOrders, substatuses, responsiblePartyVendors] = await Promise.all([
    getEvent(eventId),
    getSetupOrders(eventId),
    getSubstatusOptions(),
    getResponsiblePartyVendors(eventId, "SETUP_ORDER"),
  ]);

  if (!event) notFound();

  const workflowSummaries = setupOrders.length > 0
    ? await getWorkflowBadgeSummaries("setup_order", setupOrders.map((o) => o.id), eventId)
    : {};

  const vendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const deleteSetupOrderAction = async (formData: FormData) => {
    "use server";
    await deleteSetupOrder(formData.get("setupOrderId") as string, eventId);
  };

  const deleteSetupOrdersAction = async (ids: string[]) => {
    "use server";
    await deleteSetupOrders(ids, eventId);
  };

  const bulkUpdateSetupOrdersAction = async (
    ids: string[],
    updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
  ) => {
    "use server";
    await bulkUpdateSetupOrders(ids, eventId, updates);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Setup Orders" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>


      <SetupOrderList
        setupOrders={setupOrders}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        initialStatus={initialStatus}
        initialVendor={initialVendor}
        initialFunction={initialFunction}
        deleteSetupOrder={deleteSetupOrderAction}
        deleteSetupOrders={deleteSetupOrdersAction}
        bulkUpdateSetupOrders={bulkUpdateSetupOrdersAction}
      />
    </>
  );

}
