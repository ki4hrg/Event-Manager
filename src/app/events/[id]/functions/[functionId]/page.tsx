import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
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
  createAndAddFunctionContact,
} from "../../../functions/actions";
import {
  getAvailableAVOrdersForFunction,
  linkAVOrderToFunctionFromFunction,
  unlinkAVOrderFromFunctionPage,
} from "../../../av-orders/actions";
import {
  getAvailableCateringOrders,
  linkCateringOrderToFunctionFromFunction,
  unlinkCateringOrderFromFunctionPage,
} from "../../../catering-orders/actions";
import {
  getAvailableSetupOrdersForFunction,
  linkSetupOrderToFunctionFromFunction,
  unlinkSetupOrderFromFunctionPage,
} from "../../../setup-orders/actions";
import {
  getAvailablePrintOrdersForFunction,
  linkPrintOrderToFunctionFromFunction,
  unlinkPrintOrderFromFunctionPage,
} from "../../../print-orders/actions";
import {
  getAvailableMediaOrdersForFunction,
  linkMediaOrderToFunctionFromFunction,
  unlinkMediaOrderFromFunctionPage,
} from "../../../media-orders/actions";
import { FunctionForm } from "../../../functions/FunctionForm";
import { ScheduleList } from "../../../functions/ScheduleList";
import { ContactList } from "../../../functions/ContactList";
import { AVOrderPanel } from "../../../av-orders/AVOrderPanel";
import { CateringOrderPanel } from "../../../catering-orders/CateringOrderPanel";
import { SetupOrderPanel } from "../../../setup-orders/SetupOrderPanel";
import { PrintOrderPanel } from "../../../print-orders/PrintOrderPanel";
import { MediaOrderPanel } from "../../../media-orders/MediaOrderPanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { sortRoomsByGroupThenName } from "@/lib/roomGroups";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; functionId: string }>;
}): Promise<Metadata> {
  const { functionId } = await params;
  const fn = await prisma.function.findUnique({
    where: { id: functionId },
    select: { name: true },
  });
  return { title: fn?.name ?? "Function" };
}

export default async function FunctionPage({
  params,
}: {
  params: Promise<{ id: string; functionId: string }>;
}) {
  const { id: eventId, functionId } = await params;
  const [event, fn, functionTypes, scheduleTypes, breakoutGroups] = await Promise.all([
    getEvent(eventId),
    getFunction(functionId),
    getOptions("function_type"),
    getOptions("schedule_type"),
    prisma.breakoutGroup.findMany({
      where: { eventId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!event || !fn) {
    notFound();
  }

  if (fn.type === "BREAKOUT_BLOCK") {
    redirect(`/events/${eventId}/breakout-schedule`);
  }

  // Get rooms from the event's venue (sorted to keep groups adjacent)
  const rooms = sortRoomsByGroupThenName(
    event.venueId
      ? await prisma.room.findMany({
          where: { venueId: event.venueId },
          include: { group: { select: { id: true, name: true, sortOrder: true } } },
          orderBy: { name: "asc" },
        })
      : []
  );

  const [availableAVOrders, availableCateringOrders, availableSetupOrders, availablePrintOrders, availableMediaOrders, workflowInstances, allTemplates, substatuses] = await Promise.all([
    getAvailableAVOrdersForFunction(eventId, functionId),
    fn.cateringOrder ? [] : getAvailableCateringOrders(eventId),
    getAvailableSetupOrdersForFunction(eventId, functionId),
    getAvailablePrintOrdersForFunction(eventId, functionId),
    getAvailableMediaOrdersForFunction(eventId, functionId),
    getWorkflowInstances("function", functionId, eventId),
    getWorkflowTemplateOptions(),
    getSubstatusOptions(),
  ]);

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

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
    return createSchedule(functionId, eventId, formData);
  };

  const updateScheduleAction = async (scheduleId: string, formData: FormData) => {
    "use server";
    return updateSchedule(scheduleId, functionId, eventId, formData);
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

  const createContactAction = async (formData: FormData) => {
    "use server";
    await createAndAddFunctionContact(functionId, eventId, formData);
  };

  const removeContactAction = async (contactId: string) => {
    "use server";
    await removeFunctionContact(contactId, functionId, eventId);
  };

  const linkAVOrderAction = async (avOrderId: string) => {
    "use server";
    await linkAVOrderToFunctionFromFunction(avOrderId, functionId, eventId);
  };

  const unlinkAVOrderAction = async (avOrderId: string) => {
    "use server";
    await unlinkAVOrderFromFunctionPage(avOrderId, functionId, eventId);
  };

  const linkCateringOrderAction = async (cateringOrderId: string) => {
    "use server";
    await linkCateringOrderToFunctionFromFunction(cateringOrderId, functionId, eventId);
  };

  const unlinkCateringOrderAction = async () => {
    "use server";
    await unlinkCateringOrderFromFunctionPage(functionId, eventId);
  };

  const linkSetupOrderAction = async (setupOrderId: string) => {
    "use server";
    await linkSetupOrderToFunctionFromFunction(setupOrderId, functionId, eventId);
  };

  const unlinkSetupOrderAction = async (setupOrderId: string) => {
    "use server";
    await unlinkSetupOrderFromFunctionPage(setupOrderId, functionId, eventId);
  };

  const linkPrintOrderAction = async (printOrderId: string) => {
    "use server";
    await linkPrintOrderToFunctionFromFunction(printOrderId, functionId, eventId);
  };

  const unlinkPrintOrderAction = async (printOrderId: string) => {
    "use server";
    await unlinkPrintOrderFromFunctionPage(printOrderId, functionId, eventId);
  };

  const linkMediaOrderAction = async (mediaOrderId: string) => {
    "use server";
    await linkMediaOrderToFunctionFromFunction(mediaOrderId, functionId, eventId);
  };

  const unlinkMediaOrderAction = async (mediaOrderId: string) => {
    "use server";
    await unlinkMediaOrderFromFunctionPage(mediaOrderId, functionId, eventId);
  };

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "function", functionId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "function", functionId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "function", functionId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "function", functionId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("function", functionId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("function", functionId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("function", functionId, eventId);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="min-w-0">
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Functions", href: `/events/${eventId}/functions` },
            { label: fn.name },
          ]} />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {fn.name}
            </h1>
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
          <LastUpdated
            updatedAt={fn.updatedAt}
            updatedBy={fn.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          <a
            href={`/events/${eventId}/reports/function-detail?functions=${functionId}`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Detail Report
          </a>
          <a
            href={`/events/${eventId}/functions/${functionId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print
          </a>
          <form action={duplicateFunctionAction}>
            <button
              type="submit"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Duplicate
            </button>
          </form>
          <CancelOrDeleteButton
            status={fn.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteFunctionAction}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
              <EntityStatusPanel
                standalone={false}
                entityType="function"
                entityId={functionId}
                eventId={eventId}
                status={fn.status ?? null}
                substatus={fn.substatus ?? null}
                substatuses={substatuses}
                setStatus={setStatusAction}
              />
            </div>
            <FunctionForm
              noCard
              fn={fn}
              rooms={rooms}
              eventId={eventId}
              functionTypes={functionTypes}
              action={updateFunctionAction}
              breakoutGroups={fn.type === "BREAKOUT_BLOCK" ? breakoutGroups : undefined}
            />
          </div>
          <ContactList
            contacts={fn.contacts}
            addContact={addContactAction}
            updateContact={updateContactAction}
            removeContact={removeContactAction}
            searchContacts={searchContactsAction}
            createContact={createContactAction}
          />
          <WorkflowPanel
            instances={workflowInstances}
            availableTemplates={availableWorkflowTemplates}
            entityStatus={fn.status ?? null}
            assignWorkflow={assignWorkflowAction}
            removeWorkflow={removeWorkflowAction}
            toggleStep={toggleStepAction}
            toggleItem={toggleItemAction}
          />
        </div>

        <div className="lg:col-span-2 space-y-8">
          <ScheduleList
            schedules={fn.schedules}
            scheduleTypes={scheduleTypes}
            functionId={functionId}
            timezone={event.timezone}
            createSchedule={createScheduleAction}
            updateSchedule={updateScheduleAction}
            deleteSchedule={deleteScheduleAction}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
            <AVOrderPanel
              title="AV Orders"
              avOrders={fn.avOrders}
              eventId={eventId}
              availableAVOrders={availableAVOrders}
              newAVOrderPath={`/events/${eventId}/av-orders/new?functionId=${functionId}`}
              linkAVOrder={linkAVOrderAction}
              unlinkAVOrder={unlinkAVOrderAction}
            />
            <CateringOrderPanel
              cateringOrder={fn.cateringOrder}
              eventId={eventId}
              availableCateringOrders={availableCateringOrders}
              newCateringOrderPath={`/events/${eventId}/catering-orders/new?functionId=${functionId}`}
              linkCateringOrder={linkCateringOrderAction}
              unlinkCateringOrder={unlinkCateringOrderAction}
            />
            <SetupOrderPanel
              setupOrders={fn.setupOrders}
              eventId={eventId}
              availableSetupOrders={availableSetupOrders}
              newSetupOrderPath={`/events/${eventId}/setup-orders/new?functionId=${functionId}${fn.rooms[0] ? `&roomId=${fn.rooms[0].roomId}` : ""}`}
              linkSetupOrder={linkSetupOrderAction}
              unlinkSetupOrder={unlinkSetupOrderAction}
            />
            <PrintOrderPanel
              mode="function"
              printOrders={fn.printOrderFunctions.map((pof) => pof.printOrder)}
              eventId={eventId}
              availablePrintOrders={availablePrintOrders}
              newPrintOrderPath={`/events/${eventId}/print-orders/new?functionId=${functionId}`}
              linkPrintOrder={linkPrintOrderAction}
              unlinkPrintOrder={unlinkPrintOrderAction}
            />
            <MediaOrderPanel
              title="Media Orders"
              mediaOrders={fn.mediaOrderFunctions.map((mof) => mof.mediaOrder)}
              eventId={eventId}
              availableMediaOrders={availableMediaOrders}
              newMediaOrderPath={`/events/${eventId}/media-orders/new?functionId=${functionId}`}
              linkMediaOrder={linkMediaOrderAction}
              unlinkMediaOrder={unlinkMediaOrderAction}
            />
          </div>
        </div>
      </div>
    </>
  );

}
