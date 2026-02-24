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
  searchContacts,
  addFunctionContact,
  updateFunctionContact,
  removeFunctionContact,
} from "../../../functions/actions";
import {
  getAvailableAVOrdersForFunction,
  linkAVOrderToFunctionFromFunction,
  unlinkAVOrderFromFunctionPage,
} from "../../../av-orders/actions";
import {
  getAvailableBEOs,
  linkBEOToFunctionFromFunction,
  unlinkBEOFromFunctionPage,
} from "../../../beos/actions";
import { FunctionForm } from "../../../functions/FunctionForm";
import { ScheduleList } from "../../../functions/ScheduleList";
import { ContactList } from "../../../functions/ContactList";
import { AVOrderPanel } from "../../../av-orders/AVOrderPanel";
import { BEOPanel } from "../../../beos/BEOPanel";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function FunctionPage({
  params,
}: {
  params: Promise<{ id: string; functionId: string }>;
}) {
  const { id: eventId, functionId } = await params;
  const [event, fn, functionTypes, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getFunction(functionId),
    getOptions("function_type"),
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

  const [availableAVOrders, availableBEOs] = await Promise.all([
    fn.avOrder ? [] : getAvailableAVOrdersForFunction(eventId),
    fn.beo ? [] : getAvailableBEOs(eventId),
  ]);

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

  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContacts(query);
  };

  const addContactAction = async (formData: FormData) => {
    "use server";
    await addFunctionContact(functionId, eventId, formData);
  };

  const updateContactAction = async (contactId: string, formData: FormData) => {
    "use server";
    await updateFunctionContact(contactId, functionId, eventId, formData);
  };

  const removeContactAction = async (contactId: string) => {
    "use server";
    await removeFunctionContact(contactId, functionId, eventId);
  };

  const linkAVOrderAction = async (avOrderId: string) => {
    "use server";
    await linkAVOrderToFunctionFromFunction(avOrderId, functionId, eventId);
  };

  const unlinkAVOrderAction = async () => {
    "use server";
    await unlinkAVOrderFromFunctionPage(functionId, eventId);
  };

  const linkBEOAction = async (beoId: string) => {
    "use server";
    await linkBEOToFunctionFromFunction(beoId, functionId, eventId);
  };

  const unlinkBEOAction = async () => {
    "use server";
    await unlinkBEOFromFunctionPage(functionId, eventId);
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
            action={updateFunctionAction}
          />
        </div>

        <div className="space-y-8">
          <ScheduleList
            schedules={fn.schedules}
            scheduleTypes={scheduleTypes}
            functionId={functionId}
            timezone={event.timezone}
            createSchedule={createScheduleAction}
            updateSchedule={updateScheduleAction}
            deleteSchedule={deleteScheduleAction}
          />
          <ContactList
            contacts={fn.contacts}
            functionId={functionId}
            addContact={addContactAction}
            updateContact={updateContactAction}
            removeContact={removeContactAction}
            searchContacts={searchContactsAction}
          />
          <AVOrderPanel
            title="AV Order"
            avOrder={fn.avOrder}
            eventId={eventId}
            availableAVOrders={availableAVOrders}
            newAVOrderPath={`/events/${eventId}/av-orders/new?functionId=${functionId}`}
            linkAVOrder={linkAVOrderAction}
            unlinkAVOrder={unlinkAVOrderAction}
            avOrderDetailPath={(avOrderId) => `/events/${eventId}/av-orders/${avOrderId}`}
          />
          <BEOPanel
            beo={fn.beo}
            eventId={eventId}
            availableBEOs={availableBEOs}
            newBEOPath={`/events/${eventId}/beos/new?functionId=${functionId}`}
            linkBEO={linkBEOAction}
            unlinkBEO={unlinkBEOAction}
            beoDetailPath={(beoId) => `/events/${eventId}/beos/${beoId}`}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
