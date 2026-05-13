import { notFound } from "next/navigation";
import { getEvent } from "../../actions";
import {
  getEventVendors,
  searchVendorsForEvent,
  addVendorToEvent,
  removeVendorFromEvent,
  setDefaultVendor,
  removeDefaultVendor,
  type ModelType,
} from "@/app/vendors/actions";
import { EventVendorList } from "./EventVendorList";

export const dynamic = "force-dynamic";

export default async function EventVendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, eventVendors] = await Promise.all([
    getEvent(eventId),
    getEventVendors(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const searchVendorsAction = async (query: string) => {
    "use server";
    return searchVendorsForEvent(query, eventId);
  };

  const addVendorAction = async (vendorId: string) => {
    "use server";
    await addVendorToEvent(eventId, vendorId);
  };

  const removeVendorAction = async (eventVendorId: string) => {
    "use server";
    await removeVendorFromEvent(eventVendorId, eventId);
  };

  const setDefaultAction = async (eventVendorId: string, modelType: ModelType) => {
    "use server";
    await setDefaultVendor(eventVendorId, modelType, eventId);
  };

  const removeDefaultAction = async (eventVendorId: string, modelType: ModelType) => {
    "use server";
    await removeDefaultVendor(eventVendorId, modelType, eventId);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        {event.name}
      </h1>

      <EventVendorList
        eventVendors={eventVendors}
        searchVendors={searchVendorsAction}
        addVendor={addVendorAction}
        removeVendor={removeVendorAction}
        setDefault={setDefaultAction}
        removeDefault={removeDefaultAction}
      />
    </>
  );

}
