import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/event";
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

export const metadata: Metadata = { title: "Vendors" };

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

  const setDefaultAction = async (vendorId: string, modelType: ModelType) => {
    "use server";
    await setDefaultVendor(eventId, vendorId, modelType);
  };

  const removeDefaultAction = async (vendorId: string, modelType: ModelType) => {
    "use server";
    await removeDefaultVendor(eventId, vendorId, modelType);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Vendors" },
        ]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

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
