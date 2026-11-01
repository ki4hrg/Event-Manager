import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge } from "@/components/WorkflowStatusBadge";
import { WorkflowStrips } from "@/components/WorkflowStrips";
import { workflowBadgeSummary } from "@/lib/workflowProgress";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getEvent } from "@/app/events/event";
import {
  getMediaDeliverable,
  updateMediaDeliverable,
  deleteMediaDeliverable,
  linkMediaDeliverableToFunction,
  unlinkMediaDeliverableFromFunction,
  linkMediaDeliverableToPresentation,
  unlinkMediaDeliverableFromPresentation,
  addMediaDeliverableContact,
  updateMediaDeliverableContact,
  removeMediaDeliverableContact,
  createAndAddMediaDeliverableContact,
  searchContactsForMediaDeliverable,
} from "../../../media-deliverables/actions";
import { ContactList } from "../../../functions/ContactList";
import { getResponsibleParties } from "@/lib/responsibleParties";
import { getOptions, getSubstatusOptions } from "@/app/(admin)/settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/(admin)/workflows/actions";
import { MediaDeliverableTabs, MEDIA_DELIVERABLE_TABS } from "../../../media-deliverables/MediaDeliverableTabs";
import { MediaDeliverableForm } from "../../../media-deliverables/MediaDeliverableForm";
import { MediaDeliverableLinkPanel } from "../../../media-deliverables/MediaDeliverableLinkPanel";
import { formatFunctionLabel } from "@/lib/functionNumbers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; mediaDeliverableId: string }>;
}): Promise<Metadata> {
  const { mediaDeliverableId } = await params;
  const mediaDeliverable = await prisma.mediaDeliverable.findUnique({
    where: { id: mediaDeliverableId },
    select: { name: true },
  });
  return { title: mediaDeliverable?.name ?? "Media Deliverable" };
}

export default async function MediaDeliverablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mediaDeliverableId: string }>;
  searchParams: Promise<{ tab?: string; success?: string }>;
}) {
  const { id: eventId, mediaDeliverableId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = MEDIA_DELIVERABLE_TABS.some((t) => t.value === tab) ? tab : "overview";

  const [event, mediaDeliverable, workflowInstances, allTemplates] = await Promise.all([
    getEvent(eventId),
    getMediaDeliverable(mediaDeliverableId),
    getWorkflowInstances("media_deliverable", mediaDeliverableId, eventId),
    getWorkflowTemplateOptions(),
  ]);

  if (!event || !mediaDeliverable) notFound();

  const linkedFunctionIds = new Set(mediaDeliverable.functions.map((f) => f.id));
  const linkedPresentationIds = new Set(mediaDeliverable.presentations.map((p) => p.id));

  const [
    fileTypeOptions, deliverableFiles, substatuses,
    mediaTypeOptions, deliveryOptions, allFunctions, allPresentations, pool, assignmentRoles,
  ] = await Promise.all([
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { mediaDeliverableId }, orderBy: { createdAt: "asc" } }),
    getSubstatusOptions(),
    getOptions("media_type"),
    getOptions("delivery_method"),
    prisma.function.findMany({ where: { eventId }, orderBy: { name: "asc" }, select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } }),
    prisma.presentation.findMany({ where: { eventId }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    getResponsibleParties({
      eventId,
      modelType: "MEDIA_DELIVERABLE",
      orderContacts: mediaDeliverable.contacts,
      functionIds: mediaDeliverable.functions.map((f) => f.id),
      presentationIds: mediaDeliverable.presentations.map((p) => p.id),
    }),
    getOptions("assignment_role"),
  ]);

  const unlinkableFunctions = allFunctions.filter((f) => !linkedFunctionIds.has(f.id));
  const unlinkablePresentations = allPresentations.filter((p) => !linkedPresentationIds.has(p.id));

  const updateAction = async (formData: FormData) => {
    "use server";
    return updateMediaDeliverable(mediaDeliverableId, eventId, formData);
  };

  const deleteAction = async () => {
    "use server";
    await deleteMediaDeliverable(mediaDeliverableId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkMediaDeliverableToFunction(mediaDeliverableId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async (functionId: string) => {
    "use server";
    await unlinkMediaDeliverableFromFunction(mediaDeliverableId, functionId, eventId);
  };

  const linkToPresentationAction = async (presentationId: string) => {
    "use server";
    await linkMediaDeliverableToPresentation(mediaDeliverableId, presentationId, eventId);
  };

  const unlinkFromPresentationAction = async (presentationId: string) => {
    "use server";
    await unlinkMediaDeliverableFromPresentation(mediaDeliverableId, presentationId, eventId);
  };

  const addContactAction = async (formData: FormData) => {
    "use server";
    return addMediaDeliverableContact(mediaDeliverableId, eventId, formData);
  };
  const updateContactAction = async (id: string, formData: FormData) => {
    "use server";
    return updateMediaDeliverableContact(id, mediaDeliverableId, eventId, formData);
  };
  const removeContactAction = async (id: string) => {
    "use server";
    await removeMediaDeliverableContact(id, mediaDeliverableId, eventId);
  };
  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContactsForMediaDeliverable(query);
  };
  const createContactAction = async (formData: FormData) => {
    "use server";
    return createAndAddMediaDeliverableContact(mediaDeliverableId, eventId, formData);
  };

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "media_deliverable", mediaDeliverableId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "media_deliverable", mediaDeliverableId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "media_deliverable", mediaDeliverableId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "media_deliverable", mediaDeliverableId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("media_deliverable", mediaDeliverableId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("media_deliverable", mediaDeliverableId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("media_deliverable", mediaDeliverableId, eventId);
  };

  const entityStatus = mediaDeliverable.status ?? null;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Media Deliverables", href: `/events/${eventId}/media-deliverables` },
              { label: mediaDeliverable.name },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {mediaDeliverable.name}
            </h1>
            <EntityStatusBadge status={entityStatus} substatus={mediaDeliverable.substatus ?? null} />
            <WorkflowStatusBadge summary={workflowBadgeSummary(workflowInstances)} />
          </div>
          <LastUpdated
            updatedAt={mediaDeliverable.updatedAt}
            updatedBy={mediaDeliverable.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          <CancelOrDeleteButton
            resource="MEDIA_DELIVERABLES"
            status={mediaDeliverable.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteAction}
          />
        </div>
      </div>

      <WorkflowStrips instances={workflowInstances} />

      <MediaDeliverableTabs basePath={`/events/${eventId}/media-deliverables/${mediaDeliverableId}`} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="max-w-2xl space-y-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
              <EntityStatusPanel
                standalone={false}
                entityType="media_deliverable"
                entityId={mediaDeliverableId}
                eventId={eventId}
                status={mediaDeliverable.status ?? null}
                substatus={mediaDeliverable.substatus ?? null}
                substatuses={substatuses}
                setStatus={setStatusAction}
              />
            </div>
            <MediaDeliverableForm
              noCard
              mediaDeliverable={mediaDeliverable}
              eventId={eventId}
              action={updateAction}
              pool={pool}
              mediaTypeOptions={mediaTypeOptions}
              deliveryOptions={deliveryOptions}
            />
          </div>

          <MediaDeliverableLinkPanel
            linkedFunctions={mediaDeliverable.functions.map((f) => ({
              id: f.id,
              label: formatFunctionLabel(f),
              detailPath: `/events/${eventId}/functions/${f.id}`,
            }))}
            availableFunctions={unlinkableFunctions.map((f) => ({ id: f.id, label: formatFunctionLabel(f) }))}
            linkFunction={linkToFunctionAction}
            unlinkFunction={unlinkFromFunctionAction}
            linkedPresentations={mediaDeliverable.presentations.map((p) => ({
              id: p.id,
              label: p.title,
              detailPath: `/events/${eventId}/presentations/${p.id}`,
            }))}
            availablePresentations={unlinkablePresentations.map((p) => ({ id: p.id, label: p.title }))}
            linkPresentation={linkToPresentationAction}
            unlinkPresentation={unlinkFromPresentationAction}
          />

          <ContactList
            resource="MEDIA_DELIVERABLES"
            contacts={mediaDeliverable.contacts}
            roles={assignmentRoles.map((o) => o.label)}
            addContact={addContactAction}
            updateContact={updateContactAction}
            removeContact={removeContactAction}
            searchContacts={searchContactsAction}
            createContact={createContactAction}
          />

          <WorkflowPanel
            entityType="media_deliverable"
            instances={workflowInstances}
            availableTemplates={availableWorkflowTemplates}
            entityStatus={mediaDeliverable.status ?? null}
            assignWorkflow={assignWorkflowAction}
            removeWorkflow={removeWorkflowAction}
            toggleStep={toggleStepAction}
            toggleItem={toggleItemAction}
          />
        </div>
      )}

      {activeTab === "files" && (
        <FileUploadPanel
          entityType="mediaDeliverable"
          entityId={mediaDeliverableId}
          files={deliverableFiles}
          fileTypeOptions={fileTypeOptions}
          revalidateTarget={`/events/${eventId}/media-deliverables/${mediaDeliverableId}`}
        />
      )}
    </>
  );
}
