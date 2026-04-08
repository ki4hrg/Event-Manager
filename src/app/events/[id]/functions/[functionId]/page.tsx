import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
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
import { FunctionForm } from "../../../functions/FunctionForm";
import { ScheduleList } from "../../../functions/ScheduleList";
import { ContactList } from "../../../functions/ContactList";
import { AVOrderPanel } from "../../../av-orders/AVOrderPanel";
import { CateringOrderPanel } from "../../../catering-orders/CateringOrderPanel";
import { SetupOrderPanel } from "../../../setup-orders/SetupOrderPanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { getOptions } from "@/app/settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";

export const dynamic = "force-dynamic";

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

  // Get rooms from the event's venue
  const rooms = event.venueId
    ? await prisma.room.findMany({
        where: { venueId: event.venueId },
        orderBy: { name: "asc" },
      })
    : [];

  const [availableAVOrders, availableCateringOrders, availableSetupOrders, workflowInstances, allTemplates] = await Promise.all([
    fn.avOrder ? [] : getAvailableAVOrdersForFunction(eventId),
    fn.cateringOrder ? [] : getAvailableCateringOrders(eventId),
    fn.setupOrder ? [] : getAvailableSetupOrdersForFunction(eventId),
    getWorkflowInstances("function", functionId),
    getWorkflowTemplateOptions(),
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

  const unlinkAVOrderAction = async () => {
    "use server";
    await unlinkAVOrderFromFunctionPage(functionId, eventId);
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

  const unlinkSetupOrderAction = async () => {
    "use server";
    await unlinkSetupOrderFromFunctionPage(functionId, eventId);
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

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: fn.name },
          ]} />
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
            breakoutGroups={fn.type === "BREAKOUT_BLOCK" ? breakoutGroups : undefined}
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
            addContact={addContactAction}
            updateContact={updateContactAction}
            removeContact={removeContactAction}
            searchContacts={searchContactsAction}
            createContact={createContactAction}
          />
          <AVOrderPanel
            title="AV Order"
            avOrder={fn.avOrder}
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
            setupOrder={fn.setupOrder ? { ...fn.setupOrder, function: { name: fn.name } } : null}
            eventId={eventId}
            availableSetupOrders={availableSetupOrders}
            newSetupOrderPath={`/events/${eventId}/setup-orders/new?functionId=${functionId}${fn.rooms[0] ? `&roomId=${fn.rooms[0].roomId}` : ""}`}
            linkSetupOrder={linkSetupOrderAction}
            unlinkSetupOrder={unlinkSetupOrderAction}
          />
          <WorkflowPanel
            instances={workflowInstances}
            availableTemplates={availableWorkflowTemplates}
            assignWorkflow={assignWorkflowAction}
            removeWorkflow={removeWorkflowAction}
            toggleStep={toggleStepAction}
            toggleItem={toggleItemAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
