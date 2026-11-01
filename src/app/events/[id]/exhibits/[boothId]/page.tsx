import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";
import { LastUpdated } from "@/components/LastUpdated";
import { btnSecondary } from "@/lib/buttonStyles";
import { getEquipment } from "@/app/equipment/actions";
import { getOptions } from "@/app/(admin)/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getEvent } from "@/app/events/event";
import {
  createBoothEquipmentItem,
  deleteBoothEquipmentItem,
  deleteExhibitBooth,
  getBoothFormChoices,
  getExhibitBooth,
  updateBoothEquipmentItem,
  updateExhibitBooth,
} from "../../../exhibits/actions";
import { BoothForm } from "../../../exhibits/BoothForm";
import { EquipmentTable } from "@/components/EquipmentTable";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Booth" };

export default async function BoothPage({ params }: { params: Promise<{ id: string; boothId: string }> }) {
  const { id: eventId, boothId } = await params;
  const [event, booth, choices, equipmentOptions, equipmentCategories, partyVendors] = await Promise.all([
    getEvent(eventId),
    getExhibitBooth(boothId, eventId),
    getBoothFormChoices(eventId),
    getEquipment(),
    getOptions("equipment_category"),
    getResponsiblePartyVendors(eventId),
  ]);
  if (!event || !booth) notFound();

  const updateAction = async (formData: FormData) => {
    "use server";
    return updateExhibitBooth(boothId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteExhibitBooth(boothId, eventId);
  };
  const createItem = async (formData: FormData) => {
    "use server";
    return createBoothEquipmentItem(boothId, eventId, formData);
  };
  const updateItem = async (id: string, formData: FormData) => {
    "use server";
    return updateBoothEquipmentItem(id, boothId, eventId, formData);
  };
  const deleteItem = async (id: string) => {
    "use server";
    await deleteBoothEquipmentItem(id, boothId, eventId);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Exhibits", href: `/events/${eventId}/exhibits` },
              { label: booth.name },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {booth.boothNumber && <span className="mr-2 text-gray-500 dark:text-gray-400">Booth {booth.boothNumber}</span>}
            {booth.name}
          </h1>
          {booth.group && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Group:{" "}
              <Link href={`/events/${eventId}/exhibits/groups/${booth.group.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                {booth.group.name}
              </Link>
            </p>
          )}
          <LastUpdated updatedAt={booth.updatedAt} updatedBy={booth.updatedBy} timezone={event.timezone} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          <Link href={`/events/${eventId}/reports/esg?parts=IIIb`} className={btnSecondary}>
            Report
          </Link>
          <DeleteButton action={deleteAction} resource="FUNCTIONS" label="Delete Booth" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 min-w-0">
          {/* Keyed on updatedAt so a save remounts the form back into view mode. */}
          <BoothForm
            key={booth.updatedAt.toISOString()}
            booth={booth}
            timezone={event.timezone}
            functions={choices.functions}
            contacts={choices.contacts}
            groups={choices.groups}
            boothTypes={choices.boothTypes}
            costCenters={choices.costCenters}
            action={updateAction}
            cancelHref={`/events/${eventId}/exhibits`}
          />
        </div>
        <div className="lg:col-span-2 min-w-0 space-y-2">
          {booth.group && booth.group.equipmentItems.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                From{" "}
                <Link href={`/events/${eventId}/exhibits/groups/${booth.group.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {booth.group.name}
                </Link>
              </h2>
              <ul className="mt-2 text-sm text-gray-700 dark:text-gray-300 divide-y divide-gray-200 dark:divide-gray-700">
                {booth.group.equipmentItems.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 break-words">{e.equipment?.name ?? e.item}</span>
                    {e.quantity != null && <span className="text-gray-500 dark:text-gray-400">{e.quantity}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Inventory needed</h2>
          <EquipmentTable
            items={booth.equipmentItems}
            partyVendors={flattenResponsiblePartyOptions(partyVendors)}
            equipmentOptions={equipmentOptions}
            equipmentCategories={equipmentCategories}
            createItem={createItem}
            updateItem={updateItem}
            deleteItem={deleteItem}
            resource="FUNCTIONS"
          />
        </div>
      </div>
    </>
  );
}
