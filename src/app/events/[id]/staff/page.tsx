import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { getEvent } from "@/app/events/event";
import {
  getEventStaff,
  addEventStaff,
  removeEventStaff,
  setEventStaffLevel,
  searchUsersForStaff,
} from "./actions";
import { EventStaffList } from "./EventStaffList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Staff" };

export default async function EventStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, staff] = await Promise.all([getEvent(id), getEventStaff(id)]);
  if (!event) notFound();

  const addStaffAction = async (formData: FormData) => {
    "use server";
    return addEventStaff(id, formData);
  };

  const removeStaffAction = async (staffId: string) => {
    "use server";
    return removeEventStaff(staffId, id);
  };

  const setLevelAction = async (staffId: string, accessLevel: string) => {
    "use server";
    return setEventStaffLevel(staffId, id, accessLevel);
  };

  const searchUsersAction = async (query: string) => {
    "use server";
    return searchUsersForStaff(id, query);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${id}` },
          { label: "Staff" },
        ]}
        title="Staff"
        description="App users assigned to this event. Access caps what their role allows them to do here — it can narrow, never widen."
      />
      <div>
        <EventStaffList
          staff={staff}
          addStaff={addStaffAction}
          removeStaff={removeStaffAction}
          setLevel={setLevelAction}
          searchUsers={searchUsersAction}
        />
      </div>
    </>
  );
}
