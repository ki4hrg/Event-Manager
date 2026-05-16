import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import {
  getEvent,
  updateEvent,
  deleteEvent,
  addEventKeyStaff,
  updateEventKeyStaff,
  removeEventKeyStaff,
  searchContactsForKeyStaff,
  createContactAndAddKeyStaff,
} from "../actions";
import { EventForm } from "../EventForm";
import { KeyStaffList } from "../KeyStaffList";
import { auth } from "@/lib/auth";
import { setUserSetting, SETTING_KEYS } from "@/lib/userSettings";
import { getEventOverviewStats } from "./actions";
import { EntityOverviewCard } from "./EntityOverviewCard";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, venues, stats, keyStaff] = await Promise.all([
    getEvent(id),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    getEventOverviewStats(id),
    prisma.eventKeyStaff.findMany({
      where: { eventId: id },
      include: { contact: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!event) {
    notFound();
  }

  const session = await auth();
  if (session?.user?.id) {
    await setUserSetting(session.user.id, SETTING_KEYS.LAST_EVENT_ID, id);
  }

  const updateEventWithId = async (formData: FormData) => {
    "use server";
    await updateEvent(id, formData);
  };

  const deleteEventAction = async () => {
    "use server";
    await deleteEvent(id);
  };

  const addKeyStaffAction = async (formData: FormData) => {
    "use server";
    await addEventKeyStaff(id, formData);
  };

  const updateKeyStaffAction = async (keyStaffId: string, formData: FormData) => {
    "use server";
    await updateEventKeyStaff(keyStaffId, id, formData);
  };

  const removeKeyStaffAction = async (keyStaffId: string) => {
    "use server";
    await removeEventKeyStaff(keyStaffId, id);
  };

  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContactsForKeyStaff(query);
  };

  const createContactAction = async (formData: FormData) => {
    "use server";
    await createContactAndAddKeyStaff(id, formData);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[{ label: "Events", href: "/events" }, { label: event.name }]}
        title={event.name}
        actions={<DeleteButton action={deleteEventAction} />}
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Event Details
            </p>
            <EventForm venues={venues} event={event} action={updateEventWithId} />
          </div>

          <KeyStaffList
            keyStaff={keyStaff}
            addKeyStaff={addKeyStaffAction}
            updateKeyStaff={updateKeyStaffAction}
            removeKeyStaff={removeKeyStaffAction}
            searchContacts={searchContactsAction}
            createContact={createContactAction}
          />
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {stats.entities.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 sm:col-span-2">
              No content available for this event.
            </p>
          ) : (
            stats.entities.map(({ key, ...rest }) => <EntityOverviewCard key={key} {...rest} />)
          )}
        </div>
      </div>
    </>
  );
}
