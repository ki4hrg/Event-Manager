import { notFound } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
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
import { getOptions } from "@/app/settings/actions";
import { EventTabs } from "../EventTabs";
import { EventVendorList } from "./EventVendorList";

export const dynamic = "force-dynamic";

export default async function EventVendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, eventVendors, vendorTypes] = await Promise.all([
    getEvent(eventId),
    getEventVendors(eventId),
    getOptions("vendor_type"),
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
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        {event.name}
      </h1>
      <EventTabs eventId={eventId} />

      <EventVendorList
        eventVendors={eventVendors}
        vendorTypes={vendorTypes}
        searchVendors={searchVendorsAction}
        addVendor={addVendorAction}
        removeVendor={removeVendorAction}
        setDefault={setDefaultAction}
        removeDefault={removeDefaultAction}
      />
    </PageWrapper>
  );
}
