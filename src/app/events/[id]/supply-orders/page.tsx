import type { Metadata } from "next";
import { OpenFormLinkButton } from "../../forms/OpenFormLinkButton";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../actions";
import { getSupplyOrders, deleteSupplyOrder } from "../../supply-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { SupplyOrderList } from "../../supply-orders/SupplyOrderList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Supply orders" };

export default async function SupplyOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; room?: string; linked?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, room: initialRoom, linked: initialLinked } = (await searchParams) ?? {};

  const [event, supplyOrders] = await Promise.all([
    getEvent(eventId),
    getSupplyOrders(eventId),
  ]);

  if (!event) notFound();

  const workflowSummaries = supplyOrders.length > 0
    ? await getWorkflowBadgeSummaries("supply_order", supplyOrders.map((o) => o.id), eventId)
    : {};

  const deleteSupplyOrderAction = async (formData: FormData) => {
    "use server";
    await deleteSupplyOrder(formData.get("supplyOrderId") as string, eventId);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Supply Orders" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
        <OpenFormLinkButton eventId={eventId} formType="ITEM_REQUEST" title="Item request link" />
      </div>

      <SupplyOrderList
        supplyOrders={supplyOrders}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        initialStatus={initialStatus}
        initialRoom={initialRoom}
        initialLinked={initialLinked}
        deleteSupplyOrder={deleteSupplyOrderAction}
      />
    </>
  );
}
