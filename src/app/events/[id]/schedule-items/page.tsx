import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import {
  getScheduleItems,
  getScheduleTypes,
  deleteScheduleItem,
  deleteScheduleItems,
  bulkUpdateScheduleItems,
} from "../../schedule-items/actions";
import { ScheduleItemList } from "../../schedule-items/ScheduleItemList";

export const dynamic = "force-dynamic";

export default async function ScheduleItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, items, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getScheduleItems(eventId),
    getScheduleTypes(),
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
        deleteScheduleItem={deleteScheduleItemAction}
        deleteScheduleItems={deleteScheduleItemsAction}
        bulkUpdateScheduleItems={bulkUpdateScheduleItemsAction}
      />
    </>
  );
}
