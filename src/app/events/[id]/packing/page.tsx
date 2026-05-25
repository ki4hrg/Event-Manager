import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { PackingStatus } from "@prisma/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../actions";
import { getPackingListItems } from "../../packing/actions";
import { updateSupplyOrderItemPackingStatus } from "../../supply-orders/actions";
import { updatePrintItemPackingStatus } from "../../print-orders/actions";
import { PackingListClient } from "./PackingListClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Packing list" };

export default async function PackingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ state?: string; hidePacked?: string }>;
}) {
  const { id: eventId } = await params;
  const { state: initialState, hidePacked: initialHidePacked } =
    (await searchParams) ?? {};

  const [event, payload] = await Promise.all([
    getEvent(eventId),
    getPackingListItems(eventId),
  ]);

  if (!event) notFound();

  const toggleSupplyItem = async (
    itemId: string,
    supplyOrderId: string,
    packingStatus: PackingStatus,
  ) => {
    "use server";
    await updateSupplyOrderItemPackingStatus(itemId, supplyOrderId, eventId, packingStatus);
  };

  const togglePrintItem = async (
    itemId: string,
    printOrderId: string,
    packingStatus: PackingStatus,
  ) => {
    "use server";
    await updatePrintItemPackingStatus(itemId, printOrderId, eventId, packingStatus);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Packing List" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <PackingListClient
        eventId={eventId}
        payload={payload}
        initialState={initialState}
        initialHidePacked={initialHidePacked}
        toggleSupplyItem={toggleSupplyItem}
        togglePrintItem={togglePrintItem}
      />
    </>
  );
}
