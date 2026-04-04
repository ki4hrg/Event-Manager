import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent, updateEvent, deleteEvent } from "../actions";
import { EventForm } from "../EventForm";
import { getFunctions, duplicateFunction, deleteFunction } from "../functions/actions";
import { FunctionList } from "../functions/FunctionList";
import { getOptions } from "@/app/settings/actions";
import { getWorkflowBadgeSummaries } from "../workflows/actions";
import { EventTabs } from "./EventTabs";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, venues, functions, functionTypes] = await Promise.all([
    getEvent(id),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    getFunctions(id),
    getOptions("function_type"),
  ]);

  const workflowSummaries = functions.length > 0
    ? await getWorkflowBadgeSummaries("function", functions.map((f) => f.id))
    : {};

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
      <div className="flex justify-between items-center mb-4">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name },
          ]} />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Event Details
          </h2>
          <EventForm venues={venues} event={event} action={updateEventWithId} />
        </div>

        <div className="lg:col-span-2">
          <FunctionList
            functions={functions}
            eventId={id}
            timezone={event.timezone || "America/Chicago"}
            functionTypes={functionTypes}
            workflowSummaries={workflowSummaries}
            duplicateFunction={duplicateFunctionAction}
            deleteFunction={deleteFunctionAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
