import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { getEvent } from "../../../actions";
import {
  getPresentation,
  getTracks,
  updatePresentation,
  updatePresentationInstanceCount,
  deletePresentation,
  duplicatePresentation,
  addSpeaker,
  updateSpeaker,
  removeSpeaker,
  searchContacts,
  createAndAddPresentationSpeaker,
  createMediaItem,
  updateMediaItem,
  deleteMediaItem,
  getMediaItemPartyOptions,
} from "../../../presentations/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import {
  getAvailableAVOrdersForPresentation,
  linkAVOrderToPresentationFromPresentation,
  unlinkAVOrderFromPresentationPage,
} from "../../../av-orders/actions";
import {
  getAvailableSetupOrdersForPresentation,
  linkSetupOrderToPresentationFromPresentation,
  unlinkSetupOrderFromPresentationPage,
} from "../../../setup-orders/actions";
import {
  getAvailablePrintOrdersForPresentation,
  linkPrintOrderToPresentationFromPresentation,
  unlinkPrintOrderFromPresentationPage,
} from "../../../print-orders/actions";
import { SetupOrderPanel } from "../../../setup-orders/SetupOrderPanel";
import { PrintOrderPanel } from "../../../print-orders/PrintOrderPanel";
import {
  assignPresentationToBlock,
  assignPresentationToGroup,
  removeAllBreakoutAssignments,
  movePresentationSlot,
} from "../../../breakout-schedule/actions";
import { PresentationForm } from "../../../presentations/PresentationForm";
import { BreakoutSlotPanel } from "../../../presentations/BreakoutSlotPanel";
import { SpeakerList } from "../../../presentations/SpeakerList";
import { AVOrderPanel } from "../../../av-orders/AVOrderPanel";
import { MediaItemsPanel } from "../../../presentations/MediaItemsPanel";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ id: string; presentationId: string }>;
}) {
  const { id: eventId, presentationId } = await params;
  const [event, presentation, tracks, presenterRoles, presentationTypes, workflowInstances, allTemplates, deliveryOptions, substatuses] = await Promise.all([
    getEvent(eventId),
    getPresentation(presentationId),
    getTracks(eventId),
    getOptions("presenter_role"),
    getOptions("presentation_type"),
    getWorkflowInstances("presentation", presentationId),
    getWorkflowTemplateOptions(),
    getOptions("delivery_method"),
    getSubstatusOptions(),
  ]);

  if (!event || !presentation) {
    notFound();
  }

  const [breakoutGroups, availableAVOrders, availableSetupOrders, availablePrintOrders, mediaItemPartyOptions] = await Promise.all([
    prisma.breakoutGroup.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        rooms: {
          select: {
            room: {
              select: {
                id: true,
                name: true,
                group: { select: { id: true, name: true, sortOrder: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        },
        functions: {
          where: { type: "BREAKOUT_BLOCK" },
          select: {
            id: true,
            name: true,
            schedules: {
              select: { startTime: true, endTime: true },
              orderBy: { startTime: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    getAvailableAVOrdersForPresentation(eventId, presentationId),
    getAvailableSetupOrdersForPresentation(eventId, presentationId),
    presentation.printOrder
      ? Promise.resolve([])
      : getAvailablePrintOrdersForPresentation(eventId),
    getMediaItemPartyOptions(presentationId, eventId),
  ]);

  const breakoutGroupsFull = breakoutGroups.map((g) => ({
    id: g.id,
    name: g.name,
    rooms: g.rooms.map((r) => ({ id: r.room.id, name: r.room.name, group: r.room.group })),
    sessions: g.functions,
  }));

  const updatePresentationAction = async (formData: FormData) => {
    "use server";
    await updatePresentation(presentationId, eventId, formData);
  };

  const deletePresentationAction = async () => {
    "use server";
    await deletePresentation(presentationId, eventId);
  };

  const duplicatePresentationAction = async () => {
    "use server";
    await duplicatePresentation(presentationId, eventId);
  };

  const addSpeakerAction = async (formData: FormData) => {
    "use server";
    await addSpeaker(presentationId, eventId, formData);
  };

  const updateSpeakerAction = async (speakerId: string, formData: FormData) => {
    "use server";
    await updateSpeaker(speakerId, presentationId, eventId, formData);
  };

  const removeSpeakerAction = async (speakerId: string) => {
    "use server";
    await removeSpeaker(speakerId, presentationId, eventId);
  };

  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContacts(query);
  };

  const createContactAction = async (formData: FormData) => {
    "use server";
    await createAndAddPresentationSpeaker(presentationId, eventId, formData);
  };

  const linkAVOrderAction = async (avOrderId: string) => {
    "use server";
    await linkAVOrderToPresentationFromPresentation(avOrderId, presentationId, eventId);
  };

  const unlinkAVOrderAction = async (avOrderId: string) => {
    "use server";
    await unlinkAVOrderFromPresentationPage(avOrderId, presentationId, eventId);
  };

  const linkSetupOrderAction = async (setupOrderId: string) => {
    "use server";
    await linkSetupOrderToPresentationFromPresentation(setupOrderId, presentationId, eventId);
  };

  const unlinkSetupOrderAction = async (setupOrderId: string) => {
    "use server";
    await unlinkSetupOrderFromPresentationPage(setupOrderId, presentationId, eventId);
  };

  const linkPrintOrderAction = async (printOrderId: string) => {
    "use server";
    await linkPrintOrderToPresentationFromPresentation(printOrderId, presentationId, eventId);
  };

  const unlinkPrintOrderAction = async () => {
    "use server";
    await unlinkPrintOrderFromPresentationPage(presentationId, eventId);
  };

  const addSlotAction = async (functionId: string, roomId: string | null) => {
    "use server";
    await assignPresentationToBlock(presentationId, functionId, roomId, eventId);
  };

  const removeAllAction = async () => {
    "use server";
    await removeAllBreakoutAssignments(presentationId, eventId);
  };

  const editSlotAction = async (slotId: string, functionId: string, roomId: string | null) => {
    "use server";
    return movePresentationSlot(slotId, functionId, roomId, eventId);
  };

  const assignToGroupAction = async (groupId: string) => {
    "use server";
    await assignPresentationToGroup(presentationId, groupId, eventId);
  };

  const updateInstanceCountAction = async (count: number) => {
    "use server";
    await updatePresentationInstanceCount(presentationId, eventId, count);
  };

  const createMediaItemAction = async (formData: FormData) => {
    "use server";
    await createMediaItem(presentationId, eventId, formData);
  };

  const updateMediaItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateMediaItem(id, presentationId, eventId, formData);
  };

  const deleteMediaItemAction = async (id: string) => {
    "use server";
    await deleteMediaItem(id, presentationId, eventId);
  };

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "presentation", presentationId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "presentation", presentationId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "presentation", presentationId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "presentation", presentationId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("presentation", presentationId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("presentation", presentationId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("presentation", presentationId, eventId);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Presentations", href: `/events/${eventId}/presentations` },
            { label: presentation.title },
          ]} />
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {presentation.title}
            </h1>
            <EntityStatusBadge status={presentation.status ?? null} substatus={presentation.substatus ?? null} />
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
        </div>
        <div className="flex gap-2">
          <form action={duplicatePresentationAction}>
            <button
              type="submit"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Duplicate
            </button>
          </form>
          <CancelOrDeleteButton
            status={presentation.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deletePresentationAction}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
              <EntityStatusPanel
                standalone={false}
                entityType="presentation"
                entityId={presentationId}
                eventId={eventId}
                status={presentation.status ?? null}
                substatus={presentation.substatus ?? null}
                substatuses={substatuses}
                setStatus={setStatusAction}
              />
            </div>
            <PresentationForm
              noCard
              presentation={presentation}
              eventId={eventId}
              tracks={tracks}
              presenterRoles={presenterRoles}
              presentationTypes={presentationTypes}
              action={updatePresentationAction}
              searchContacts={searchContactsAction}
            />
          </div>

          <WorkflowPanel
            instances={workflowInstances}
            availableTemplates={availableWorkflowTemplates}
            entityStatus={presentation.status ?? null}
            assignWorkflow={assignWorkflowAction}
            removeWorkflow={removeWorkflowAction}
            toggleStep={toggleStepAction}
            toggleItem={toggleItemAction}
          />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <SpeakerList
            speakers={presentation.speakers}
            presenterRoles={presenterRoles}
            presentationId={presentationId}
            addSpeaker={addSpeakerAction}
            updateSpeaker={updateSpeakerAction}
            removeSpeaker={removeSpeakerAction}
            searchContacts={searchContactsAction}
            createContact={createContactAction}
          />

          <BreakoutSlotPanel
            slots={presentation.slots}
            eventId={eventId}
            timezone={event.timezone}
            instanceCount={presentation.instanceCount}
            currentGroupId={presentation.breakoutGroupId}
            groups={breakoutGroupsFull}
            addSlot={addSlotAction}
            removeAll={removeAllAction}
            editSlot={editSlotAction}
            assignToGroup={assignToGroupAction}
            updateInstanceCount={updateInstanceCountAction}
          />

          <AVOrderPanel
            title="AV Orders"
            avOrders={presentation.avOrders}
            eventId={eventId}
            availableAVOrders={availableAVOrders}
            newAVOrderPath={`/events/${eventId}/av-orders/new?presentationId=${presentationId}`}
            linkAVOrder={linkAVOrderAction}
            unlinkAVOrder={unlinkAVOrderAction}
          />
          <SetupOrderPanel
            setupOrders={presentation.setupOrders}
            eventId={eventId}
            availableSetupOrders={availableSetupOrders}
            newSetupOrderPath={`/events/${eventId}/setup-orders/new?presentationId=${presentationId}`}
            linkSetupOrder={linkSetupOrderAction}
            unlinkSetupOrder={unlinkSetupOrderAction}
          />
          <PrintOrderPanel
            printOrder={presentation.printOrder ?? null}
            eventId={eventId}
            availablePrintOrders={availablePrintOrders}
            newPrintOrderPath={`/events/${eventId}/print-orders/new?presentationId=${presentationId}`}
            linkPrintOrder={linkPrintOrderAction}
            unlinkPrintOrder={unlinkPrintOrderAction}
          />
          <MediaItemsPanel
            mediaItems={presentation.mediaItems}
            deliveryOptions={deliveryOptions}
            vendorOptions={mediaItemPartyOptions.vendors}
            contactOptions={mediaItemPartyOptions.contacts}
            createItem={createMediaItemAction}
            updateItem={updateMediaItemAction}
            deleteItem={deleteMediaItemAction}
          />
        </div>
      </div>
    </>
  );

}
