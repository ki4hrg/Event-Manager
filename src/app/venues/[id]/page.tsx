import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getVenue, updateVenue, deleteVenue, createRoom, updateRoom, deleteRoom } from "../actions";
import { VenueForm } from "../VenueForm";
import { RoomList } from "../RoomList";

export const dynamic = "force-dynamic";

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await getVenue(id);

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

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href="/venues"
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            ← Back to Venues
          </Link>
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

        <div>
          <RoomList
            rooms={venue.rooms}
            venueId={id}
            createRoom={createRoomAction}
            updateRoom={updateRoomAction}
            deleteRoom={deleteRoomAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
