import type { Metadata } from "next";
import { Suspense } from "react";
import { StepFilterChip } from "@/components/StepFilterChip";
import { atWorkflowStep, stepFilterLabel } from "@/lib/workflowProgress";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/event";
import { getSetupOrders, deleteSetupOrder, deleteSetupOrders, bulkUpdateSetupOrders } from "../../setup-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions } from "@/app/(admin)/settings/actions";
import { getHiddenColumns } from "@/app/events/table-columns-actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { SetupOrderList } from "../../setup-orders/SetupOrderList";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Setup orders" };

export default async function SetupOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; vendor?: string; function?: string; linked?: string; step?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, vendor: initialVendor, function: initialFunction, linked: initialLinked, step } = (await searchParams) ?? {};
  const [event, setupOrders, substatuses, responsiblePartyVendors, hiddenColumns] = await Promise.all([
    getEvent(eventId),
    getSetupOrders(eventId),
    getSubstatusOptions(),
    getResponsiblePartyVendors(eventId, "SETUP_ORDER"),
    getHiddenColumns("setup_orders"),
  ]);

  if (!event) notFound();

  const workflowSummaries = setupOrders.length > 0
    ? await getWorkflowBadgeSummaries("setup_order", setupOrders.map((o) => o.id), eventId)
    : {};
  const stepLabel = stepFilterLabel(workflowSummaries, step);
  const shown = stepLabel && step ? setupOrders.filter((r) => atWorkflowStep(workflowSummaries[r.id], step)) : setupOrders;

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

      {stepLabel && (
        <Suspense fallback={null}>
          <StepFilterChip label={stepLabel} />
        </Suspense>
      )}
      <SetupOrderList
        setupOrders={shown}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        initialStatus={initialStatus}
        initialVendor={initialVendor}
        initialFunction={initialFunction}
        initialLinked={initialLinked}
        initialHiddenColumns={hiddenColumns}
        deleteSetupOrder={deleteSetupOrderAction}
        deleteSetupOrders={deleteSetupOrdersAction}
        bulkUpdateSetupOrders={bulkUpdateSetupOrdersAction}
      />
    </>
  );

}
