import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../../actions";
import { createFunction } from "../../../functions/actions";
import { FunctionForm } from "../../../functions/FunctionForm";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function NewFunctionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; groupId?: string }>;
}) {
  const { id: eventId } = await params;
  const { type: defaultType, groupId: breakoutGroupId } = await searchParams;
  const [event, functionTypes] = await Promise.all([
    getEvent(eventId),
    getOptions("function_type"),
  ]);

  if (!event) {
    notFound();
  }

  // Get rooms from the event's venue
  const rooms = event.venueId
    ? await prisma.room.findMany({
        where: { venueId: event.venueId },
        orderBy: { name: "asc" },
      })
    : [];

  const createFunctionWithEventId = async (formData: FormData) => {
    "use server";
    await createFunction(eventId, formData);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          ← Back to {event.name}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Function
        </h1>
      </div>

      {!event.venueId && (
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
      />
    </PageWrapper>
  );
}
