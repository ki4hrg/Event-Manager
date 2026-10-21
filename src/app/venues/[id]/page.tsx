import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/tenant";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import {
  getVenue,
  updateVenue,
  updateVenueVendorDetails,
  deleteVenue,
  createRoom,
  updateRoom,
  deleteRoom,
  createRoomGroup,
  updateRoomGroup,
  deleteRoomGroup,
  searchContacts,
  addVenueContact,
  updateVenueContact,
  removeVenueContact,
  createAndAddVenueContact,
  saveVenueConcessions,
} from "../actions";
import { VenueForm } from "../VenueForm";
import { RoomList } from "../RoomList";
import { ContactList } from "../ContactList";
import { getOptions } from "@/app/settings/actions";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { hasPermission } from "@/lib/permissions";
import { getVenueHotelHistory } from "@/app/hotels/actions";
import { HotelHistory } from "@/app/hotels/HotelHistory";
import { RfpConcessionsEditor } from "@/app/events/rfps/RfpConcessionsEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const venue = await prisma.venue.findFirst({
    where: { id, tenantId: (await getActiveTenantId()) ?? "" },
    select: { name: true },
  });
  return { title: venue?.name ?? "Venue" };
}

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [venue, fileTypeOptions, venueFiles, brands, areas, concessionOptions, canViewHotels] = await Promise.all([
    getVenue(id),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { venueId: id }, orderBy: { createdAt: "asc" } }),
    getOptions("hotel_brand"),
    getOptions("hotel_area"),
    getOptions("rfp_concession"),
    hasPermission("HOTELS", "VIEW"),
  ]);

  if (!venue) {
    notFound();
  }
  const hotelHistory = venue.isLodging && canViewHotels ? await getVenueHotelHistory(id) : [];

  const updateVenueWithId = async (formData: FormData) => {
    "use server";
    await updateVenue(id, formData);
  };

  const deleteVenueAction = async () => {
    "use server";
    await deleteVenue(id);
  };

  const createRoomAction = async (formData: FormData) => {
    "use server";
    await createRoom(id, formData);
  };

  const updateRoomAction = async (roomId: string, formData: FormData) => {
    "use server";
    await updateRoom(roomId, id, formData);
  };

  const deleteRoomAction = async (roomId: string) => {
    "use server";
    await deleteRoom(roomId, id);
  };

  const createRoomGroupAction = async (formData: FormData) => {
    "use server";
    await createRoomGroup(id, formData);
  };

  const updateRoomGroupAction = async (groupId: string, formData: FormData) => {
    "use server";
    await updateRoomGroup(groupId, id, formData);
  };

  const deleteRoomGroupAction = async (groupId: string) => {
    "use server";
    await deleteRoomGroup(groupId, id);
  };

  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContacts(query);
  };

  const addContactAction = async (formData: FormData) => {
    "use server";
    await addVenueContact(id, formData);
  };

  const updateContactAction = async (contactId: string, formData: FormData) => {
    "use server";
    await updateVenueContact(contactId, id, formData);
  };

  const removeContactAction = async (contactId: string) => {
    "use server";
    await removeVenueContact(contactId, id);
  };

  const createContactAction = async (formData: FormData) => {
    "use server";
    await createAndAddVenueContact(id, formData);
  };

  const saveConcessionsAction = async (rows: { label: string; value: string | null }[]) => {
    "use server";
    await saveVenueConcessions(id, rows.map((r) => ({ label: r.label, value: r.value })));
  };

  const updateVendorDetailsAction = async (formData: FormData) => {
    "use server";
    await updateVenueVendorDetails(id, formData);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[{ label: "Venues", href: "/venues" }, { label: venue.name }]}
        title={venue.name}
        meta={<LastUpdated updatedAt={venue.updatedAt} updatedBy={venue.updatedBy} />}
        actions={<DeleteButton resource="VENUES" action={deleteVenueAction} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8 min-w-0">
          {/* Keyed on updatedAt so a save remounts the form back into view mode. */}
          <VenueForm key={venue.updatedAt.toISOString()} venue={venue} brands={brands.map((b) => b.label)} areas={areas} action={updateVenueWithId} />
          {venue.isLodging && (
            <RfpConcessionsEditor
              key={`concessions-${venue.updatedAt.toISOString()}`}
              resource="VENUES"
              concessions={venue.concessions.map((c) => ({ id: c.id, label: c.label, value: c.value, required: false }))}
              options={concessionOptions.map((o) => ({ label: o.label, group: o.group }))}
              save={saveConcessionsAction}
              withRequired={false}
              valueLabel="Terms"
              valuePlaceholder="Included, $10/night…"
            />
          )}
          {hotelHistory.length > 0 && <HotelHistory proposals={hotelHistory} />}
          {venue.vendor && (
            <form action={updateVendorDetailsAction} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Vendor Details</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={venue.vendor.notes || ""}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Vendor Details
              </button>
            </form>
          )}
        </div>

        <div className="lg:col-span-2 space-y-8 min-w-0">
          <RoomList
            rooms={venue.rooms}
            roomGroups={venue.roomGroups}
            venueId={id}
            createRoom={createRoomAction}
            updateRoom={updateRoomAction}
            deleteRoom={deleteRoomAction}
            createRoomGroup={createRoomGroupAction}
            updateRoomGroup={updateRoomGroupAction}
            deleteRoomGroup={deleteRoomGroupAction}
          />
          <ContactList
            contacts={venue.contacts}
            venueId={id}
            addContact={addContactAction}
            updateContact={updateContactAction}
            removeContact={removeContactAction}
            searchContacts={searchContactsAction}
            createContact={createContactAction}
          />
          <FileUploadPanel
            entityType="venue"
            entityId={id}
            files={venueFiles}
            fileTypeOptions={fileTypeOptions}
            revalidateTarget={`/venues/${id}`}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
