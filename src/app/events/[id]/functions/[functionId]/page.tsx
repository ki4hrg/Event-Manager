import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getFunction,
  updateFunction,
  updateFunctionEsg,
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
  getAvailableSupplyOrdersForFunction,
  linkSupplyOrderToFunctionFromFunction,
  unlinkSupplyOrderFromFunctionPage,
} from "../../../supply-orders/actions";
import {
  getAvailableMediaDeliverablesForFunction,
  linkMediaDeliverableToFunctionFromFunction,
  unlinkMediaDeliverableFromFunctionPage,
} from "../../../media-deliverables/actions";
import { FunctionForm } from "../../../functions/FunctionForm";
import { FunctionEsgCard } from "../../../functions/FunctionEsgCard";
import { ScheduleList } from "../../../functions/ScheduleList";
import { ContactList } from "../../../functions/ContactList";
import { AVOrderPanel } from "../../../av-orders/AVOrderPanel";
import { CateringOrderPanel } from "../../../catering-orders/CateringOrderPanel";
import { SetupOrderPanel } from "../../../setup-orders/SetupOrderPanel";
import { PrintOrderPanel } from "../../../print-orders/PrintOrderPanel";
import { SupplyOrderPanel } from "../../../supply-orders/SupplyOrderPanel";
import { MediaDeliverablePanel } from "../../../media-deliverables/MediaDeliverablePanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { getEventRooms } from "@/lib/eventVenues";

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

  const booths = [...fn.exhibitBooths, ...fn.exhibitBoothGroups.flatMap((g) => g.booths)].sort(
    (a, b) => (a.boothNumber ?? "").localeCompare(b.boothNumber ?? "", undefined, { numeric: true }) || a.name.localeCompare(b.name),
  );

  // Rooms across every event venue, venue-first then group then name
  const rooms = await getEventRooms(eventId);

  const [availableAVOrders, availableCateringOrders, availableSetupOrders, availablePrintOrders, availableSupplyOrders, availableMediaDeliverables, workflowInstances, allTemplates, substatuses] = await Promise.all([
    getAvailableAVOrdersForFunction(eventId, functionId),
    fn.cateringOrder ? [] : getAvailableCateringOrders(eventId),
    getAvailableSetupOrdersForFunction(eventId, functionId),
    getAvailablePrintOrdersForFunction(eventId, functionId),
    getAvailableSupplyOrdersForFunction(eventId, functionId),
    getAvailableMediaDeliverablesForFunction(eventId, functionId),
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

  const updateFunctionEsgAction = async (formData: FormData) => {
    "use server";
    await updateFunctionEsg(functionId, eventId, formData);
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

  const linkSupplyOrderAction = async (supplyOrderId: string) => {
    "use server";
    await linkSupplyOrderToFunctionFromFunction(supplyOrderId, functionId, eventId);
  };

  const unlinkSupplyOrderAction = async (supplyOrderId: string) => {
    "use server";
    await unlinkSupplyOrderFromFunctionPage(supplyOrderId, functionId, eventId);
  };

  const linkMediaDeliverableAction = async (mediaDeliverableId: string) => {
    "use server";
    await linkMediaDeliverableToFunctionFromFunction(mediaDeliverableId, functionId, eventId);
  };

  const unlinkMediaDeliverableAction = async (mediaDeliverableId: string) => {
    "use server";
    await unlinkMediaDeliverableFromFunctionPage(mediaDeliverableId, functionId, eventId);
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
              {fn.functionNumber && (
                <span className="mr-2 text-gray-500 dark:text-gray-400">#{fn.functionNumber}</span>
              )}
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
            resource="FUNCTIONS"
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
          <FunctionEsgCard
            fn={fn}
            numbersLocked={event.functionNumbersLockedAt !== null}
            action={updateFunctionEsgAction}
          />
          <ContactList
            contacts={fn.contacts}
            addContact={addContactAction}
            updateContact={updateContactAction}
            removeContact={removeContactAction}
            searchContacts={searchContactsAction}
            createContact={createContactAction}
          />
          <WorkflowPanel
            entityType="function"
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
            eventStartDate={event.startDate}
            eventEndDate={event.endDate}
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
              fillHeight
              linkAVOrder={linkAVOrderAction}
              unlinkAVOrder={unlinkAVOrderAction}
            />
            <div className="flex flex-col gap-4 h-full">
              <CateringOrderPanel
                cateringOrder={fn.cateringOrder}
                eventId={eventId}
                availableCateringOrders={availableCateringOrders}
                newCateringOrderPath={`/events/${eventId}/catering-orders/new?functionId=${functionId}`}
                linkCateringOrder={linkCateringOrderAction}
                unlinkCateringOrder={unlinkCateringOrderAction}
              />
              {fn.cateringServiceLocations.length > 0 && (
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    Additional Catering Service Locations
                  </h3>
                  <ul className="space-y-2">
                    {fn.cateringServiceLocations.map((loc) => (
                      <li key={loc.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 text-sm">
                            <Link
                              href={`/events/${eventId}/catering-orders/${loc.cateringOrder.id}`}
                              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              {loc.cateringOrder.name}
                            </Link>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Service location{loc.name ? <>: <span className="text-gray-700 dark:text-gray-300">{loc.name}</span></> : " for this function"}
                              {loc.expectedCount != null && <span> · {loc.expectedCount} expected</span>}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <SetupOrderPanel
              setupOrders={fn.setupOrders}
              eventId={eventId}
              availableSetupOrders={availableSetupOrders}
              newSetupOrderPath={`/events/${eventId}/setup-orders/new?functionId=${functionId}${fn.rooms[0] ? `&roomId=${fn.rooms[0].roomId}` : ""}`}
              fillHeight
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
            <SupplyOrderPanel
              supplyOrders={fn.supplyOrderLinks.map((l) => l.supplyOrder)}
              eventId={eventId}
              availableSupplyOrders={availableSupplyOrders}
              newSupplyOrderPath={`/events/${eventId}/supply-orders/new?functionId=${functionId}${fn.rooms[0] ? `&roomId=${fn.rooms[0].roomId}` : ""}`}
              fillHeight
              linkSupplyOrder={linkSupplyOrderAction}
              unlinkSupplyOrder={unlinkSupplyOrderAction}
            />
            <MediaDeliverablePanel
              title="Media Deliverables"
              mediaDeliverables={fn.mediaDeliverableFunctions.map((mdf) => mdf.mediaDeliverable)}
              eventId={eventId}
              availableMediaDeliverables={availableMediaDeliverables}
              newMediaDeliverablePath={`/events/${eventId}/media-deliverables/new?functionId=${functionId}`}
              emptyMessage="Media to display at this function (looped slides, sponsor video, etc.). Provided by a vendor or a sponsor contact."
              fillHeight
              linkMediaDeliverable={linkMediaDeliverableAction}
              unlinkMediaDeliverable={unlinkMediaDeliverableAction}
            />
            {(booths.length > 0 || /exhibit/i.test(fn.type)) && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">Exhibit Booths</h3>
                  <Link
                    href={`/events/${eventId}/exhibits/new?functionId=${functionId}`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    + Add booth
                  </Link>
                </div>
                {booths.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No booths yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {booths.map((b) => (
                        <li key={b.id}>
                          <Link href={`/events/${eventId}/exhibits/${b.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {b.boothNumber ? `Booth ${b.boothNumber} · ` : ""}
                            {b.name}
                          </Link>
                          {b.companyName && <span className="text-gray-500 dark:text-gray-400"> — {b.companyName}</span>}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

}
