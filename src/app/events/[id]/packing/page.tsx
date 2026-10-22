import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { btnOutlinedSm } from "@/lib/buttonStyles";
import { REPORTS } from "@/lib/reportRegistry";
import { Toast } from "@/components/Toast";
import { getEvent } from "@/app/events/event";
import {
  getPackingListItems,
  getSavedProviderFilter,
  savePackingProviderFilter,
  getSavedLocationFilter,
  savePackingLocationFilter,
  returnItemsToLocation,
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
    location?: string;
    groupBy?: string;
  }>;
}) {
  const { id: eventId } = await params;
  const {
    state: initialState,
    hideHandled: hideHandledParam,
    hidePacked: legacyHidePacked,
    provider: urlProvider,
    location: urlLocation,
    groupBy: urlGroupBy,
  } = (await searchParams) ?? {};
  // Legacy `?hidePacked=1` bookmarks from before the rename still apply.
  const initialHideHandled = hideHandledParam ?? legacyHidePacked;

  // URL param wins when present, so skip the saved-setting lookup in that
  // case (saves a DB query on every 15s polling refresh).
  const [event, payload, savedProvider, savedLocation] = await Promise.all([
    getEvent(eventId),
    getPackingListItems(eventId),
    urlProvider == null ? getSavedProviderFilter(eventId) : Promise.resolve<string | null>(null),
    urlLocation == null ? getSavedLocationFilter(eventId) : Promise.resolve<string | null>(null),
  ]);

  if (!event) notFound();

  const initialProvider = urlProvider ?? savedProvider ?? "";
  const initialLocation = urlLocation ?? savedLocation ?? "";

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

  const saveLocationFilter = async (value: string) => {
    "use server";
    await savePackingLocationFilter(eventId, value);
  };

  const returnItems = async (supplyItemIds: string[], targetLocationId: string) => {
    "use server";
    return returnItemsToLocation(supplyItemIds, targetLocationId, eventId);
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
            { label: "Packing" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-x-1">
            <span>Items from</span>
            {payload.canSeeSupply && (
              <Link
                href={`/events/${eventId}/supply-orders`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Supply Orders
              </Link>
            )}
            {payload.canSeeSupply && payload.canSeePrint && <span>·</span>}
            {payload.canSeePrint && (
              <Link
                href={`/events/${eventId}/print-orders`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Print Orders
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/events/${eventId}/${REPORTS.PACKING_LIST.path}`} className={btnOutlinedSm}>
              {REPORTS.PACKING_LIST.label} report
            </Link>
            {payload.canWriteSupply && (
              <Link href={`/events/${eventId}/supply-orders/new`} className={btnOutlinedSm}>
                + Supply order
              </Link>
            )}
            {payload.canWritePrint && (
              <Link href={`/events/${eventId}/print-orders/new`} className={btnOutlinedSm}>
                + Print order
              </Link>
            )}
          </div>
        </div>
      </div>

      <PackingListClient
        eventId={eventId}
        payload={payload}
        initialState={initialState}
        initialHideHandled={initialHideHandled}
        initialProvider={initialProvider}
        initialLocation={initialLocation}
        initialGroupBy={urlGroupBy}
        toggleSupplyItem={toggleSupplyItem}
        togglePrintItem={togglePrintItem}
        toggleSupplyAcquisition={toggleSupplyAcquisition}
        togglePrintAcquisition={togglePrintAcquisition}
        saveProviderFilter={saveProviderFilter}
        saveLocationFilter={saveLocationFilter}
        returnItemsToLocation={returnItems}
      />
    </>
  );
}
