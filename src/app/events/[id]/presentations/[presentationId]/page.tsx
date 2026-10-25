import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge } from "@/components/WorkflowStatusBadge";
import { workflowBadgeSummary } from "@/lib/workflowProgress";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { getEvent } from "@/app/events/event";
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
} from "../../../presentations/actions";
import { setSlotAdvancer, clearSlotAdvancer } from "../../../breakout-schedule/actions";
import { getResponsibleParties } from "@/lib/responsibleParties";
import {
  getAvailableMediaDeliverablesForPresentation,
  linkMediaDeliverableToPresentationFromPresentation,
  unlinkMediaDeliverableFromPresentationPage,
} from "../../../media-deliverables/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/(admin)/workflows/actions";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { DELIVERABLES_SECTIONS, SPEAKER_PROFILE_SECTIONS } from "@/lib/forms/meta";
import { toDateTimeLocal } from "@/lib/esg/format";
import { getSpeakerHotelBlocks, getSpeakerProfiles, removeSpeakerHeadshot, updateSpeakerContactFields, updateSpeakerProfile } from "../../../speakers/actions";
import { SpeakerProfilesPanel } from "../../../speakers/SpeakerProfilesPanel";
import { FormLinkEntry } from "../../../forms/FormLinkEntry";
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
import {
  getAvailableSupplyOrdersForPresentation,
  linkSupplyOrderToPresentationFromPresentation,
  unlinkSupplyOrderFromPresentationPage,
} from "../../../supply-orders/actions";
import { SetupOrderPanel } from "../../../setup-orders/SetupOrderPanel";
import { PrintOrderPanel } from "../../../print-orders/PrintOrderPanel";
import { SupplyOrderPanel } from "../../../supply-orders/SupplyOrderPanel";
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
import { MediaDeliverablePanel } from "../../../media-deliverables/MediaDeliverablePanel";
import { getOptions, getSubstatusOptions } from "@/app/(admin)/settings/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; presentationId: string }>;
}): Promise<Metadata> {
  const { presentationId } = await params;
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { title: true },
  });
  return { title: presentation?.title ?? "Presentation" };
}

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ id: string; presentationId: string }>;
}) {
  const { id: eventId, presentationId } = await params;
  const [event, presentation, tracks, presenterRoles, presentationTypes, workflowInstances, allTemplates, substatuses, dietaryOptions] = await Promise.all([
    getEvent(eventId),
    getPresentation(presentationId),
    getTracks(eventId),
    getOptions("presenter_role"),
    getOptions("presentation_type"),
    getWorkflowInstances("presentation", presentationId, eventId),
    getWorkflowTemplateOptions(),
    getSubstatusOptions(),
    getOptions("dietary_need"),
  ]);

  if (!event || !presentation) {
    notFound();
  }

  const [breakoutGroups, availableAVOrders, availableSetupOrders, availablePrintOrders, availableSupplyOrders, availableMediaDeliverables, advancerPool] = await Promise.all([
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
            functionNumber: true,
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
    getAvailableSupplyOrdersForPresentation(eventId, presentationId),
    getAvailableMediaDeliverablesForPresentation(eventId, presentationId),
    getResponsibleParties({ eventId, modelType: "AV_ORDER", presentationIds: [presentationId] }),
  ]);

  const advancerOptions = advancerPool;

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

  const linkSupplyOrderAction = async (supplyOrderId: string) => {
    "use server";
    await linkSupplyOrderToPresentationFromPresentation(supplyOrderId, presentationId, eventId);
  };

  const unlinkSupplyOrderAction = async (supplyOrderId: string) => {
    "use server";
    await unlinkSupplyOrderFromPresentationPage(supplyOrderId, presentationId, eventId);
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

  const setSlotAdvancerAction = async (slotId: string, vendorId: string | null, contactId: string | null) => {
    "use server";
    await setSlotAdvancer(slotId, eventId, vendorId, contactId);
  };

  const clearSlotAdvancerAction = async (slotId: string) => {
    "use server";
    await clearSlotAdvancer(slotId, eventId);
  };

  const linkMediaDeliverableAction = async (mediaDeliverableId: string) => {
    "use server";
    await linkMediaDeliverableToPresentationFromPresentation(mediaDeliverableId, presentationId, eventId);
  };

  const unlinkMediaDeliverableAction = async (mediaDeliverableId: string) => {
    "use server";
    await unlinkMediaDeliverableFromPresentationPage(mediaDeliverableId, presentationId, eventId);
  };

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const [speakerProfiles, speakerHotelBlocks] = await Promise.all([
    getSpeakerProfiles(eventId, presentation.speakers.map((sp) => sp.contactId)),
    getSpeakerHotelBlocks(eventId),
  ]);
  const saveSpeakerContactAction = async (contactId: string, formData: FormData) => {
    "use server";
    await updateSpeakerContactFields(eventId, presentationId, contactId, formData);
  };
  const saveSpeakerProfileAction = async (contactId: string, formData: FormData) => {
    "use server";
    await updateSpeakerProfile(eventId, presentationId, contactId, formData);
  };
  const removeSpeakerHeadshotAction = async (contactId: string) => {
    "use server";
    await removeSpeakerHeadshot(eventId, presentationId, contactId);
  };

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
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="min-w-0">
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Presentations", href: `/events/${eventId}/presentations` },
            { label: presentation.title },
          ]} />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {presentation.title}
            </h1>
            <EntityStatusBadge status={presentation.status ?? null} substatus={presentation.substatus ?? null} />
            <WorkflowStatusBadge summary={workflowBadgeSummary(workflowInstances)} />
          </div>
          <LastUpdated
            updatedAt={presentation.updatedAt}
            updatedBy={presentation.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          <FormLinkEntry
            eventId={eventId}
            formType="SPEAKER_PROFILE"
            title="Request speaker info"
            target={{ field: "presentationId", id: presentationId }}
            sections={SPEAKER_PROFILE_SECTIONS}
            companion={{ formType: "PRESENTATION_DELIVERABLES", sections: DELIVERABLES_SECTIONS, externalUpload: true }}
            recipients={presentation.speakers.map((s) => ({
              contactId: s.contact.id,
              name: [s.contact.firstName, s.contact.lastName].filter(Boolean).join(" "),
              email: s.contact.email,
            }))}
            requireRecipient
          />
          <FormLinkEntry
            eventId={eventId}
            formType="PRESENTATION_DELIVERABLES"
            title="Request deliverables"
            externalUpload
            target={{ field: "presentationId", id: presentationId }}
            sections={DELIVERABLES_SECTIONS}
            companion={{ formType: "SPEAKER_PROFILE", sections: SPEAKER_PROFILE_SECTIONS, requireRecipient: true }}
            recipients={presentation.speakers.map((s) => ({
              contactId: s.contact.id,
              name: [s.contact.firstName, s.contact.lastName].filter(Boolean).join(" "),
              email: s.contact.email,
            }))}
          />
          <form action={duplicatePresentationAction}>
            <button
              type="submit"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Duplicate
            </button>
          </form>
          <CancelOrDeleteButton
            resource="PRESENTATIONS"
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
              advancerOptions={advancerOptions}
            />
          </div>

          <WorkflowPanel
            entityType="presentation"
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

          <SpeakerProfilesPanel
            speakers={presentation.speakers.map((sp) => {
              const prof = speakerProfiles[sp.contactId];
              return {
                contactId: sp.contactId,
                name: [sp.contact.firstName, sp.contact.lastName].filter(Boolean).join(" "),
                updatedAt: `${sp.contact.updatedAt.toISOString()}|${prof?.updatedAt.toISOString() ?? ""}`,
                contact: {
                  bio: sp.contact.bio,
                  pronouns: sp.contact.pronouns,
                  jobTitle: sp.contact.jobTitle,
                  website: sp.contact.website,
                  headshotFileId: sp.contact.headshotFileId,
                },
                profile: prof
                  ? {
                      arrivalAt: toDateTimeLocal(prof.arrivalAt, event.timezone),
                      departureAt: toDateTimeLocal(prof.departureAt, event.timezone),
                      travelNotes: prof.travelNotes,
                      hotelBlockId: prof.hotelBlockId,
                      hotel: prof.hotel,
                      dietary: prof.dietary,
                      dietaryNeeds: prof.dietaryNeeds,
                      avNeeds: prof.avNeeds,
                      shirtSize: prof.shirtSize,
                      notes: prof.notes,
                      internalNotes: prof.internalNotes,
                    }
                  : null,
              };
            })}
            dietaryNeeds={dietaryOptions.map((o) => o.label)}
            hotelBlocks={speakerHotelBlocks}
            saveContact={saveSpeakerContactAction}
            saveProfile={saveSpeakerProfileAction}
            removeHeadshot={removeSpeakerHeadshotAction}
          />

          <BreakoutSlotPanel
            slots={presentation.slots}
            eventId={eventId}
            timezone={event.timezone}
            instanceCount={presentation.instanceCount}
            currentGroupId={presentation.breakoutGroupId}
            groups={breakoutGroupsFull}
            presentationAdvancer={{
              advancerVendor: presentation.advancerVendor,
              advancerContact: presentation.advancerContact,
            }}
            advancerOptions={advancerOptions}
            addSlot={addSlotAction}
            removeAll={removeAllAction}
            editSlot={editSlotAction}
            assignToGroup={assignToGroupAction}
            updateInstanceCount={updateInstanceCountAction}
            setSlotAdvancer={setSlotAdvancerAction}
            clearSlotAdvancer={clearSlotAdvancerAction}
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
          <SupplyOrderPanel
            supplyOrders={presentation.supplyOrders}
            eventId={eventId}
            availableSupplyOrders={availableSupplyOrders}
            newSupplyOrderPath={`/events/${eventId}/supply-orders/new?presentationId=${presentationId}`}
            linkSupplyOrder={linkSupplyOrderAction}
            unlinkSupplyOrder={unlinkSupplyOrderAction}
          />
          <MediaDeliverablePanel
            title="Media Deliverables"
            mediaDeliverables={presentation.mediaDeliverables}
            eventId={eventId}
            availableMediaDeliverables={availableMediaDeliverables}
            newMediaDeliverablePath={`/events/${eventId}/media-deliverables/new?presentationId=${presentationId}`}
            linkMediaDeliverable={linkMediaDeliverableAction}
            unlinkMediaDeliverable={unlinkMediaDeliverableAction}
          />
        </div>
      </div>
    </>
  );

}
