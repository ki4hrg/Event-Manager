import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import {
  getVenue,
  updateVenue,
  deleteVenue,
  createRoom,
  updateRoom,
  deleteRoom,
  searchContacts,
  addVenueContact,
  updateVenueContact,
  removeVenueContact,
  createAndAddVenueContact,
} from "../actions";
import { VenueForm } from "../VenueForm";
import { RoomList } from "../RoomList";
import { ContactList } from "../ContactList";
import { getOptions } from "@/app/settings/actions";
import { FileUploadPanel } from "@/components/FileUploadPanel";

export const dynamic = "force-dynamic";

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [venue, fileTypeOptions, venueFiles] = await Promise.all([
    getVenue(id),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { venueId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!venue) {
    notFound();
  }

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

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Breadcrumbs items={[{ label: "Venues", href: "/venues" }, { label: venue.name }]} />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {venue.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteVenueAction}
          confirmMessage="Are you sure you want to delete this venue? All rooms will also be deleted."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Venue Details
          </h2>
          <VenueForm venue={venue} action={updateVenueWithId} />
        </div>

        <div className="space-y-8">
          <RoomList
            rooms={venue.rooms}
            venueId={id}
            createRoom={createRoomAction}
            updateRoom={updateRoomAction}
            deleteRoom={deleteRoomAction}
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
