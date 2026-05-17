import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { btnOutlinedSm } from "@/lib/buttonStyles";
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
import { EntityOverviewCard } from "./EntityOverviewCard";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
  const [event, stats, keyStaff] = await Promise.all([
    getEvent(id),
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

  const countdown = getCountdown(event.startDate, event.endDate);
  const dateRange = `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[{ label: "Events", href: "/events" }, { label: event.name }]}
        title={event.name}
        actions={
          <Link href={`/events/${id}/settings`} className={btnOutlinedSm}>
            Settings
          </Link>
        }
      />

      <div className="mb-8 flex flex-col sm:flex-row sm:items-center gap-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="text-center sm:border-r sm:border-gray-200 dark:sm:border-gray-700 sm:pr-6 shrink-0">
          <div className={`text-5xl font-bold tabular-nums ${countdown.tone}`}>{countdown.value}</div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">
            {countdown.label}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-gray-900 dark:text-white">
            {dateRange}
            {event.venue && <span className="text-gray-500 dark:text-gray-400"> · {event.venue.name}</span>}
          </p>
          {event.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{event.description}</p>
          )}
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
