import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { getEvent } from "@/app/events/actions";
import {
  getEventStaff,
  addEventStaff,
  removeEventStaff,
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
    await addEventStaff(id, formData);
  };

  const removeStaffAction = async (staffId: string) => {
    "use server";
    await removeEventStaff(staffId, id);
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
        description="App users who can access and edit this event under their assigned-scope permissions."
      />
      <div className="max-w-2xl">
        <EventStaffList
          staff={staff}
          addStaff={addStaffAction}
          removeStaff={removeStaffAction}
          searchUsers={searchUsersAction}
        />
      </div>
    </>
  );
}
