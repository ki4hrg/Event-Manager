import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { createFunction } from "../../../functions/actions";
import { FunctionForm } from "../../../functions/FunctionForm";
import { getOptions } from "@/app/settings/actions";
import { getEventRooms } from "@/lib/eventVenues";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New function" };

export default async function NewFunctionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; groupId?: string }>;
}) {
  const { id: eventId } = await params;
  // A VIEW-only user has no business on a create form; gate the page so they
  // never reach a form whose action would refuse the submit.
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const { type: defaultType, groupId: breakoutGroupId } = await searchParams;
  const [event, functionTypes] = await Promise.all([
    getEvent(eventId),
    getOptions("function_type"),
  ]);

  if (!event) {
    notFound();
  }

  // Rooms across every event venue, venue-first then group then name
  const rooms = await getEventRooms(eventId);

  const createFunctionWithEventId = async (formData: FormData) => {
    "use server";
    await createFunction(eventId, formData);
  };

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "New Function" },
        ]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Function
        </h1>
      </div>

      {event.venues.length === 0 && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-yellow-800 dark:text-yellow-200">
            This event doesn&apos;t have a venue assigned. You can still create
            functions, but you won&apos;t be able to assign rooms until a venue is
            selected.
          </p>
        </div>
      )}

      <FunctionForm
        rooms={rooms}
        eventId={eventId}
        functionTypes={functionTypes}
        action={createFunctionWithEventId}
        defaultType={defaultType}
        breakoutGroupId={breakoutGroupId}
        timezone={event.timezone}
      />
    </>
  );

}
