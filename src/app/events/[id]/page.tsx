import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import {
  getEvent,
  addEventKeyStaff,
  updateEventKeyStaff,
  removeEventKeyStaff,
  searchContactsForKeyStaff,
  createContactAndAddKeyStaff,
} from "../actions";
import { KeyStaffList } from "../KeyStaffList";
import { auth } from "@/lib/auth";
import { setUserSetting, SETTING_KEYS } from "@/lib/userSettings";
import { getEventOverviewStats } from "./actions";
import { getDefaultSource } from "@/app/events/import/actions";
import { hasPermission } from "@/lib/permissions";
import { EntityOverviewCard } from "./EntityOverviewCard";
import { LastUpdated } from "@/components/LastUpdated";
import { formatEventDate } from "@/lib/agendaUtils";
import { btnPrimary } from "@/lib/buttonStyles";
import { venueNames } from "@/lib/eventVenues";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

function getCountdown(start: Date, end: Date) {
  const now = Date.now();
  const startDays = Math.ceil((new Date(start).getTime() - now) / MS_PER_DAY);
  const endDays = Math.ceil((new Date(end).getTime() - now) / MS_PER_DAY);

  if (startDays > 0) {
    return {
      value: String(startDays),
      label: startDays === 1 ? "day to go" : "days to go",
      tone: "text-blue-600 dark:text-blue-400",
    };
  }
  if (endDays >= 0) {
    return { value: "Now", label: "ongoing", tone: "text-green-600 dark:text-green-400" };
  }
  const past = Math.abs(endDays);
  return {
    value: String(past),
    label: past === 1 ? "day ago" : "days ago",
    tone: "text-gray-500 dark:text-gray-400",
  };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, stats, keyStaff, importSource, canWriteEvent] = await Promise.all([
    getEvent(id),
    getEventOverviewStats(id),
    prisma.eventKeyStaff.findMany({
      where: { eventId: id },
      include: { contact: true },
      orderBy: { sortOrder: "asc" },
    }),
    getDefaultSource(id),
    hasPermission("EVENTS", "WRITE", id),
  ]);

  if (!event) {
    notFound();
  }

  const session = await auth();
  if (session?.user?.id) {
    await setUserSetting(session.user.id, SETTING_KEYS.LAST_EVENT_ID, id);
  }

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

  // "Empty" means nothing has been built yet, so the import offer is useful
  // rather than noise. Requires at least one visible card: with none, `every`
  // is vacuously true and someone who simply can't see any entity type would be
  // told the event is empty and offered an import they can't complete.
  const isEmpty =
    stats.entities.length > 0 && stats.entities.every((e) => e.total === 0);
  const activeEntities = stats.entities.filter((e) => e.total > 0);
  const unusedEntities = stats.entities.filter((e) => e.total === 0);

  const countdown = getCountdown(event.startDate, event.endDate);
  const dateRange = `${formatEventDate(event.startDate, event.timezone)} – ${formatEventDate(event.endDate, event.timezone)}`;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div className="min-w-0">
          <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name }]} />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {dateRange}
            {event.venues.length > 0 && <span> · {venueNames(event)}</span>}
          </p>
          {event.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{event.description}</p>
          )}
          <LastUpdated
            updatedAt={event.updatedAt}
            updatedBy={event.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        </div>
        <div className="sm:shrink-0">
          <span className="inline-flex items-baseline gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5">
            <span className={`text-base font-bold tabular-nums ${countdown.tone}`}>{countdown.value}</span>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {countdown.label}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="space-y-4">
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
          {isEmpty && importSource && canWriteEvent && (
            <div className="sm:col-span-2 bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nothing scheduled yet.
              </p>
              <Link href={`/events/${id}/import`} className={`${btnPrimary} inline-block mt-3`}>
                Import from {importSource.name}
              </Link>
            </div>
          )}
          {stats.entities.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 sm:col-span-2">
              No content available for this event.
            </p>
          ) : (
            activeEntities.map(({ key, ...rest }) => <EntityOverviewCard key={key} {...rest} />)
          )}
          {unusedEntities.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Not in use
              </span>
              {unusedEntities.map((e) => (
                <Link
                  key={e.key}
                  href={e.canEdit ? `${e.basePath}/new` : e.basePath}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {e.canEdit ? `+ ${e.label}` : e.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
