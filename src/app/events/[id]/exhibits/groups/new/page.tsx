import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "../../../../actions";
import { createBoothGroup, getBoothFormChoices } from "../../../../exhibits/actions";
import { BoothGroupForm } from "../../../../exhibits/BoothForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New booth group" };

export default async function NewBoothGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string }>;
}) {
  const { id: eventId } = await params;
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const { functionId } = await searchParams;
  const [event, choices] = await Promise.all([getEvent(eventId), getBoothFormChoices(eventId)]);
  if (!event) notFound();

  const createAction = async (formData: FormData) => {
    "use server";
    await createBoothGroup(eventId, formData);
  };

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Exhibits", href: `/events/${eventId}/exhibits` },
            { label: "New Booth Group" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">New Booth Group</h1>
      </div>
      <div className="max-w-3xl">
        <BoothGroupForm
          timezone={event.timezone}
          functions={choices.functions}
          boothTypes={choices.boothTypes}
          defaultFunctionId={choices.functions.some((f) => f.id === functionId) ? functionId : undefined}
          action={createAction}
          cancelHref={`/events/${eventId}/exhibits`}
        />
      </div>
    </>
  );
}
