import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent, updateEvent, deleteEvent } from "../actions";
import { EventForm } from "../EventForm";
import { EventTabs } from "./EventTabs";
import { auth } from "@/lib/auth";
import { setUserSetting, SETTING_KEYS } from "@/lib/userSettings";
import { getEventOverviewStats } from "./actions";

export const dynamic = "force-dynamic";

function WorkflowRow({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
        <span className="text-gray-600 dark:text-gray-300">{label}</span>
      </div>
      <span className="font-medium text-gray-900 dark:text-white">{count}</span>
    </div>
  );
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, venues, stats] = await Promise.all([
    getEvent(id),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    getEventOverviewStats(id),
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

  const totalWorkflow =
    stats.workflow.notStarted + stats.workflow.inProgress + stats.workflow.done;

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-4">
        <div>
          <Breadcrumbs
            items={[{ label: "Events", href: "/events" }, { label: event.name }]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteEventAction}
          confirmMessage="Are you sure you want to delete this event? All functions will also be deleted."
        />
      </div>

      <EventTabs eventId={id} />

      <div className="space-y-4 mt-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Event Details
          </p>
          <EventForm venues={venues} event={event} action={updateEventWithId} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Functions
            </p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white mb-3">
              {stats.functions.total}
            </p>
            <div className="space-y-1 text-sm">
              <p
                className={
                  stats.functions.missingSchedule > 0
                    ? "text-amber-600 dark:text-amber-500"
                    : "text-gray-400 dark:text-gray-500"
                }
              >
                {stats.functions.missingSchedule} missing schedule
              </p>
              <p
                className={
                  stats.functions.missingRoom > 0
                    ? "text-amber-600 dark:text-amber-500"
                    : "text-gray-400 dark:text-gray-500"
                }
              >
                {stats.functions.missingRoom} missing room
              </p>
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
              Workflow
            </p>
            {totalWorkflow === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No workflows assigned
              </p>
            ) : (
              <div className="space-y-2">
                <WorkflowRow dot="bg-gray-400 dark:bg-gray-500" label="Not started" count={stats.workflow.notStarted} />
                <WorkflowRow dot="bg-yellow-400" label="In progress" count={stats.workflow.inProgress} />
                <WorkflowRow dot="bg-green-500" label="Done" count={stats.workflow.done} />
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
