import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";
import { LastUpdated } from "@/components/LastUpdated";
import { getEquipment } from "@/app/equipment/actions";
import { getOptions } from "@/app/(admin)/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { btnSecondary } from "@/lib/buttonStyles";
import { hasPermission } from "@/lib/permissions";
import { getEvent } from "@/app/events/event";
import {
  createBoothGroupEquipmentItem,
  deleteBoothGroup,
  deleteBoothGroupEquipmentItem,
  getBoothFormChoices,
  getBoothGroup,
  updateBoothGroup,
  updateBoothGroupEquipmentItem,
} from "../../../../exhibits/actions";
import { BoothGroupForm } from "../../../../exhibits/BoothForm";
import { EquipmentTable } from "@/components/EquipmentTable";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Booth group" };

export default async function BoothGroupPage({ params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id: eventId, groupId } = await params;
  const [event, group, choices, equipmentOptions, equipmentCategories, partyVendors, canWrite] = await Promise.all([
    getEvent(eventId),
    getBoothGroup(groupId, eventId),
    getBoothFormChoices(eventId),
    getEquipment(),
    getOptions("equipment_category"),
    getResponsiblePartyVendors(eventId),
    hasPermission("FUNCTIONS", "WRITE", eventId),
  ]);
  if (!event || !group) notFound();

  const updateAction = async (formData: FormData) => {
    "use server";
    return updateBoothGroup(groupId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteBoothGroup(groupId, eventId);
  };
  const createItem = async (formData: FormData) => {
    "use server";
    return createBoothGroupEquipmentItem(groupId, eventId, formData);
  };
  const updateItem = async (id: string, formData: FormData) => {
    "use server";
    return updateBoothGroupEquipmentItem(id, groupId, eventId, formData);
  };
  const deleteItem = async (id: string) => {
    "use server";
    await deleteBoothGroupEquipmentItem(id, groupId, eventId);
  };

  const booths = [...group.booths].sort(
    (a, b) => (a.boothNumber ?? "").localeCompare(b.boothNumber ?? "", undefined, { numeric: true }) || a.name.localeCompare(b.name),
  );

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
              { label: group.name },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{group.name}</h1>
          <LastUpdated updatedAt={group.updatedAt} updatedBy={group.updatedBy} timezone={event.timezone} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          {canWrite && (
            <Link href={`/events/${eventId}/exhibits/new?groupId=${groupId}`} className={btnSecondary}>
              Add Booth
            </Link>
          )}
          <DeleteButton action={deleteAction} resource="FUNCTIONS" label="Delete Group" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 min-w-0">
          {/* Keyed on updatedAt so a save remounts the form back into view mode. */}
          <BoothGroupForm
            key={group.updatedAt.toISOString()}
            group={group}
            timezone={event.timezone}
            functions={choices.functions}
            boothTypes={choices.boothTypes}
            costCenters={choices.costCenters}
            action={updateAction}
            cancelHref={`/events/${eventId}/exhibits`}
          />
        </div>
        <div className="lg:col-span-2 min-w-0 space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Inventory per booth</h2>
            <EquipmentTable
              items={group.equipmentItems}
              partyVendors={flattenResponsiblePartyOptions(partyVendors)}
              equipmentOptions={equipmentOptions}
              equipmentCategories={equipmentCategories}
              createItem={createItem}
              updateItem={updateItem}
              deleteItem={deleteItem}
              resource="FUNCTIONS"
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Booths ({booths.length})</h2>
            {booths.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No booths yet.</p>
            ) : (
              <ul className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                {booths.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/events/${eventId}/exhibits/${b.id}`}
                      className="block px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <span className="text-blue-600 dark:text-blue-400">
                        {b.boothNumber ? `Booth ${b.boothNumber} · ` : ""}
                        {b.name}
                      </span>
                      {b.companyName && <span className="text-gray-500 dark:text-gray-400"> — {b.companyName}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
