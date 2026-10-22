import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/event";
import {
  getScheduleItems,
  getScheduleTypes,
  deleteScheduleItem,
  deleteScheduleItems,
  bulkUpdateScheduleItems,
} from "../../schedule-items/actions";
import { ScheduleItemList } from "../../schedule-items/ScheduleItemList";
import { getHiddenColumns } from "@/app/events/table-columns-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Schedule items" };

export default async function ScheduleItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, items, scheduleTypes, hiddenColumns] = await Promise.all([
    getEvent(eventId),
    getScheduleItems(eventId),
    getScheduleTypes(),
    getHiddenColumns("schedule_items"),
  ]);

  if (!event) notFound();

  const deleteScheduleItemAction = async (formData: FormData) => {
    "use server";
    await deleteScheduleItem(formData.get("scheduleItemId") as string, eventId);
  };

  const deleteScheduleItemsAction = async (ids: string[]) => {
    "use server";
    await deleteScheduleItems(ids, eventId);
  };

  const bulkUpdateScheduleItemsAction = async (
    ids: string[],
    updates: { type?: string; isPublic?: boolean }
  ) => {
    "use server";
    await bulkUpdateScheduleItems(ids, eventId, updates);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Schedule Items" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <ScheduleItemList
        items={items}
        eventId={eventId}
        scheduleTypes={scheduleTypes}
        timezone={event.timezone}
        initialHiddenColumns={hiddenColumns}
        deleteScheduleItem={deleteScheduleItemAction}
        deleteScheduleItems={deleteScheduleItemsAction}
        bulkUpdateScheduleItems={bulkUpdateScheduleItemsAction}
      />
    </>
  );
}
