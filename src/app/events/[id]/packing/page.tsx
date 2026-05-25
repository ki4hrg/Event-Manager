import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../actions";
import {
  getPackingListItems,
  getSavedProviderFilter,
  savePackingProviderFilter,
} from "../../packing/actions";
import {
  updateSupplyOrderItemPackingStatus,
  updateSupplyOrderItemAcquisitionState,
} from "../../supply-orders/actions";
import {
  updatePrintItemPackingStatus,
  updatePrintItemAcquisitionState,
} from "../../print-orders/actions";
import { PackingListClient } from "./PackingListClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Packing list" };

export default async function PackingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    state?: string;
    hideHandled?: string;
    hidePacked?: string;
    provider?: string;
  }>;
}) {
  const { id: eventId } = await params;
  const {
    state: initialState,
    hideHandled: hideHandledParam,
    hidePacked: legacyHidePacked,
    provider: urlProvider,
  } = (await searchParams) ?? {};
  // Legacy `?hidePacked=1` bookmarks from before the rename still apply.
  const initialHideHandled = hideHandledParam ?? legacyHidePacked;

  // URL param wins when present, so skip the saved-setting lookup in that
  // case (saves a DB query on every 15s polling refresh).
  const [event, payload, savedProvider] = await Promise.all([
    getEvent(eventId),
    getPackingListItems(eventId),
    urlProvider == null ? getSavedProviderFilter(eventId) : Promise.resolve<string | null>(null),
  ]);

  if (!event) notFound();

  const initialProvider = urlProvider ?? savedProvider ?? "";

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

  const toggleSupplyAcquisition = async (
    itemId: string,
    supplyOrderId: string,
    acquisitionState: AcquisitionState,
  ) => {
    "use server";
    await updateSupplyOrderItemAcquisitionState(itemId, supplyOrderId, eventId, acquisitionState);
  };

  const togglePrintAcquisition = async (
    itemId: string,
    printOrderId: string,
    acquisitionState: AcquisitionState,
  ) => {
    "use server";
    await updatePrintItemAcquisitionState(itemId, printOrderId, eventId, acquisitionState);
  };

  const saveProviderFilter = async (value: string) => {
    "use server";
    await savePackingProviderFilter(eventId, value);
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
        initialHideHandled={initialHideHandled}
        initialProvider={initialProvider}
        toggleSupplyItem={toggleSupplyItem}
        togglePrintItem={togglePrintItem}
        toggleSupplyAcquisition={toggleSupplyAcquisition}
        togglePrintAcquisition={togglePrintAcquisition}
        saveProviderFilter={saveProviderFilter}
      />
    </>
  );
}
