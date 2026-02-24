import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getFunction,
  updateFunction,
  deleteFunction,
  duplicateFunction,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "../../../functions/actions";
import { FunctionForm } from "../../../functions/FunctionForm";
import { ScheduleList } from "../../../functions/ScheduleList";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function FunctionPage({
  params,
}: {
  params: Promise<{ id: string; functionId: string }>;
}) {
  const { id: eventId, functionId } = await params;
  const [event, fn, functionTypes, avEquipment, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getFunction(functionId),
    getOptions("function_type"),
    getOptions("av_equipment"),
    getOptions("schedule_type"),
  ]);

  if (!event || !fn) {
    notFound();
  }

  // Get rooms from the event's venue
  const rooms = event.venueId
    ? await prisma.room.findMany({
        where: { venueId: event.venueId },
        orderBy: { name: "asc" },
      })
    : [];

  const updateFunctionAction = async (formData: FormData) => {
    "use server";
    await updateFunction(functionId, eventId, formData);
  };

  const deleteFunctionAction = async () => {
    "use server";
    await deleteFunction(functionId, eventId);
  };

  const duplicateFunctionAction = async () => {
    "use server";
    await duplicateFunction(functionId, eventId);
  };

  const createScheduleAction = async (formData: FormData) => {
    "use server";
    await createSchedule(functionId, eventId, formData);
  };

  const updateScheduleAction = async (scheduleId: string, formData: FormData) => {
    "use server";
    await updateSchedule(scheduleId, functionId, eventId, formData);
  };

  const deleteScheduleAction = async (scheduleId: string) => {
    "use server";
    await deleteSchedule(scheduleId, functionId, eventId);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href={`/events/${eventId}`}
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            ← Back to {event.name}
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {fn.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <form action={duplicateFunctionAction}>
            <button
              type="submit"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Duplicate
            </button>
          </form>
          <DeleteButton
            action={deleteFunctionAction}
            confirmMessage="Are you sure you want to delete this function?"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <FunctionForm
            fn={fn}
            rooms={rooms}
            eventId={eventId}
            functionTypes={functionTypes}
            avEquipment={avEquipment}
            action={updateFunctionAction}
          />
        </div>

        <div>
          <ScheduleList
            schedules={fn.schedules}
            scheduleTypes={scheduleTypes}
            functionId={functionId}
            createSchedule={createScheduleAction}
            updateSchedule={updateScheduleAction}
            deleteSchedule={deleteScheduleAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
