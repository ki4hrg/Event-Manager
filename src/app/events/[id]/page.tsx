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
import { StatusSummaryCard } from "./StatusSummaryCard";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, venues, stats, keyStaff, staffCount] = await Promise.all([
    getEvent(id),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    getEventOverviewStats(id),
    prisma.eventKeyStaff.findMany({
      where: { eventId: id },
      include: { contact: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventStaff.count({ where: { eventId: id } }),
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

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Staff Access
              </p>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {staffCount} assigned
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              App users with assigned-scope access to this event.
            </p>
            <a
              href={`/events/${id}/staff`}
              className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Manage staff →
            </a>
          </div>

        </div>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 content-start">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Functions
            </p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white mb-3">
              {stats.functions.total}
            </p>
            <div className="space-y-1 text-sm">
              {stats.functions.missingSchedule > 0 ? (
                <a
                  href={`/events/${id}/functions?schedule=none`}
                  className="block text-amber-600 dark:text-amber-500 hover:underline"
                >
                  {stats.functions.missingSchedule} missing schedule
                </a>
              ) : (
                <p className="text-gray-400 dark:text-gray-500">0 missing schedule</p>
              )}
              {stats.functions.missingRoom > 0 ? (
                <a
                  href={`/events/${id}/functions?room=none`}
                  className="block text-amber-600 dark:text-amber-500 hover:underline"
                >
                  {stats.functions.missingRoom} missing room
                </a>
              ) : (
                <p className="text-gray-400 dark:text-gray-500">0 missing room</p>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <a
                href={`/events/${id}/functions`}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View functions →
              </a>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Presentations
            </p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white mb-3">
              {stats.presentations.total}
            </p>
            <div className="space-y-1 text-sm">
              <p
                className={
                  stats.presentations.unassigned > 0
                    ? "text-amber-600 dark:text-amber-500"
                    : "text-gray-400 dark:text-gray-500"
                }
              >
                {stats.presentations.unassigned} unassigned
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <a
                href={`/events/${id}/presentations`}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View presentations →
              </a>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Status
            </p>
            <StatusSummaryCard groups={stats.entityGroups} />
          </div>
        </div>
      </div>
    </>
  );
}
