import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent, updateEvent, deleteEvent } from "../actions";
import { EventForm } from "../EventForm";
import { getFunctions, duplicateFunction, deleteFunction } from "../functions/actions";
import { FunctionList } from "../functions/FunctionList";
import { getPresentations } from "../presentations/actions";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, venues, functions, presentations, functionTypes] = await Promise.all([
    getEvent(id),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    getFunctions(id),
    getPresentations(id),
    getOptions("function_type"),
  ]);

  if (!event) {
    notFound();
  }

  const updateEventWithId = async (formData: FormData) => {
    "use server";
    await updateEvent(id, formData);
  };

  const deleteEventAction = async () => {
    "use server";
    await deleteEvent(id);
  };

  const duplicateFunctionAction = async (functionId: string) => {
    "use server";
    await duplicateFunction(functionId, id);
  };

  const deleteFunctionAction = async (functionId: string) => {
    "use server";
    await deleteFunction(functionId, id);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href="/events"
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            ← Back to Events
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteEventAction}
          confirmMessage="Are you sure you want to delete this event? All functions will also be deleted."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Event Details
          </h2>
          <EventForm venues={venues} event={event} action={updateEventWithId} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Presentations Link */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                  Presentations
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {presentations.length} presentation{presentations.length !== 1 ? "s" : ""}
                </p>
              </div>
              <Link
                href={`/events/${id}/presentations`}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Manage Presentations
              </Link>
            </div>
          </div>

          <FunctionList
            functions={functions}
            eventId={id}
            functionTypes={functionTypes}
            duplicateFunction={duplicateFunctionAction}
            deleteFunction={deleteFunctionAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
