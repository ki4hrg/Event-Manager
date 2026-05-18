import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getEvent } from "../../../actions";
import {
  getMediaOrder,
  updateMediaOrder,
  deleteMediaOrder,
  linkMediaOrderToFunction,
  unlinkMediaOrderFromFunction,
  linkMediaOrderToPresentation,
  unlinkMediaOrderFromPresentation,
  createMediaItem,
  updateMediaItem,
  deleteMediaItem,
  getMediaOrderPartyOptions,
} from "../../../media-orders/actions";
import {
  getMediaOrderVendors,
  addVendorToMediaOrder,
  updateMediaOrderVendor,
  removeVendorFromMediaOrder,
  searchAssignedEventVendors,
  getResponsiblePartyVendors,
} from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { MediaOrderTabs, MEDIA_ORDER_TABS } from "../../../media-orders/MediaOrderTabs";
import { MediaOrderForm } from "../../../media-orders/MediaOrderForm";
import { MediaItemPanel } from "../../../media-orders/MediaItemPanel";
import { MediaOrderLinkPanel } from "../../../media-orders/MediaOrderLinkPanel";

export const dynamic = "force-dynamic";

export default async function MediaOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mediaOrderId: string }>;
  searchParams: Promise<{ tab?: string; success?: string }>;
}) {
  const { id: eventId, mediaOrderId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = MEDIA_ORDER_TABS.some((t) => t.value === tab) ? tab : "overview";

  const [event, mediaOrder, workflowInstances, allTemplates] = await Promise.all([
    getEvent(eventId),
    getMediaOrder(mediaOrderId),
    getWorkflowInstances("media_order", mediaOrderId, eventId),
    getWorkflowTemplateOptions(),
  ]);

  if (!event || !mediaOrder) notFound();

  const linkedFunctionIds = new Set(mediaOrder.functions.map((f) => f.id));
  const linkedPresentationIds = new Set(mediaOrder.presentations.map((p) => p.id));

  const [
    mediaOrderVendors, fileTypeOptions, mediaOrderFiles, responsiblePartyVendors, substatuses,
    deliveryOptions, allFunctions, allPresentations, partyOptions,
  ] = await Promise.all([
    getMediaOrderVendors(mediaOrderId, eventId),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { mediaOrderId }, orderBy: { createdAt: "asc" } }),
    getResponsiblePartyVendors(eventId, "MEDIA_ORDER"),
    getSubstatusOptions(),
    getOptions("delivery_method"),
    prisma.function.findMany({ where: { eventId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.presentation.findMany({ where: { eventId }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    getMediaOrderPartyOptions(mediaOrderId, eventId),
  ]);

  const unlinkableFunctions = allFunctions.filter((f) => !linkedFunctionIds.has(f.id));
  const unlinkablePresentations = allPresentations.filter((p) => !linkedPresentationIds.has(p.id));

  // Server action closures
  const updateMediaOrderAction = async (formData: FormData) => {
    "use server";
    await updateMediaOrder(mediaOrderId, eventId, formData);
  };

  const deleteMediaOrderAction = async () => {
    "use server";
    await deleteMediaOrder(mediaOrderId, eventId);
  };

  const addVendorToFormAction = async (vendorId: string) => {
    "use server";
    await addVendorToMediaOrder(mediaOrderId, vendorId, eventId);
  };

  const removeVendorFromFormAction = async (junctionId: string) => {
    "use server";
    await removeVendorFromMediaOrder(junctionId, mediaOrderId, eventId);
  };

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId, "MEDIA_ORDER");
  };

  const addVendorAction = async (vendorId: string, notes: string) => {
    "use server";
    await addVendorToMediaOrder(mediaOrderId, vendorId, eventId, notes);
  };

  const updateVendorAction = async (id: string, notes: string) => {
    "use server";
    await updateMediaOrderVendor(id, mediaOrderId, eventId, notes);
  };

  const removeVendorAction = async (id: string) => {
    "use server";
    await removeVendorFromMediaOrder(id, mediaOrderId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkMediaOrderToFunction(mediaOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async (functionId: string) => {
    "use server";
    await unlinkMediaOrderFromFunction(mediaOrderId, functionId, eventId);
  };

  const linkToPresentationAction = async (presentationId: string) => {
    "use server";
    await linkMediaOrderToPresentation(mediaOrderId, presentationId, eventId);
  };

  const unlinkFromPresentationAction = async (presentationId: string) => {
    "use server";
    await unlinkMediaOrderFromPresentation(mediaOrderId, presentationId, eventId);
  };

  const createItemAction = async (formData: FormData) => {
    "use server";
    await createMediaItem(mediaOrderId, eventId, formData);
  };

  const updateItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateMediaItem(id, mediaOrderId, eventId, formData);
  };

  const deleteItemAction = async (id: string) => {
    "use server";
    await deleteMediaItem(id, mediaOrderId, eventId);
  };

  const flatVendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "media_order", mediaOrderId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "media_order", mediaOrderId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "media_order", mediaOrderId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "media_order", mediaOrderId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("media_order", mediaOrderId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("media_order", mediaOrderId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("media_order", mediaOrderId, eventId);
  };

  const entityStatus = mediaOrder.status ?? null;

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
              { label: "Media Orders", href: `/events/${eventId}/media-orders` },
              { label: mediaOrder.name },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {mediaOrder.name}
            </h1>
            <EntityStatusBadge status={entityStatus} substatus={mediaOrder.substatus ?? null} />
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
          <LastUpdated
            updatedAt={mediaOrder.updatedAt}
            updatedBy={mediaOrder.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          <CancelOrDeleteButton
            status={mediaOrder.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteMediaOrderAction}
          />
        </div>
      </div>

      <MediaOrderTabs basePath={`/events/${eventId}/media-orders/${mediaOrderId}`} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
                <EntityStatusPanel
                  standalone={false}
                  entityType="media_order"
                  entityId={mediaOrderId}
                  eventId={eventId}
                  status={mediaOrder.status ?? null}
                  substatus={mediaOrder.substatus ?? null}
                  substatuses={substatuses}
                  setStatus={setStatusAction}
                />
              </div>
              <MediaOrderForm
                noCard
                mediaOrder={mediaOrder}
                eventId={eventId}
                action={updateMediaOrderAction}
                vendorLink={{
                  assignedVendors: mediaOrderVendors,
                  availableVendors: flatVendors.map((v) => ({ id: v.id, label: v.name })),
                  addVendor: addVendorToFormAction,
                  removeVendor: removeVendorFromFormAction,
                }}
              />
            </div>

            <MediaOrderLinkPanel
              linkedFunctions={mediaOrder.functions.map((f) => ({
                id: f.id,
                label: f.name,
                detailPath: `/events/${eventId}/functions/${f.id}`,
              }))}
              availableFunctions={unlinkableFunctions.map((f) => ({ id: f.id, label: f.name }))}
              linkFunction={linkToFunctionAction}
              unlinkFunction={unlinkFromFunctionAction}
              linkedPresentations={mediaOrder.presentations.map((p) => ({
                id: p.id,
                label: p.title,
                detailPath: `/events/${eventId}/presentations/${p.id}`,
              }))}
              availablePresentations={unlinkablePresentations.map((p) => ({ id: p.id, label: p.title }))}
              linkPresentation={linkToPresentationAction}
              unlinkPresentation={unlinkFromPresentationAction}
            />

            <WorkflowPanel
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              entityStatus={mediaOrder.status ?? null}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemAction}
            />
          </div>

          <div className="lg:col-span-2">
            <MediaItemPanel
              items={mediaOrder.items}
              deliveryOptions={deliveryOptions}
              vendors={partyOptions.responsiblePartyVendors}
              contacts={partyOptions.contacts}
              createItem={createItemAction}
              updateItem={updateItemAction}
              deleteItem={deleteItemAction}
            />
          </div>
        </div>
      )}

      {activeTab === "vendors" && (
        <VendorPanel
          assignedVendors={mediaOrderVendors}
          eventId={eventId}
          searchEventVendors={searchEventVendorsAction}
          addVendor={addVendorAction}
          updateVendor={updateVendorAction}
          removeVendor={removeVendorAction}
        />
      )}

      {activeTab === "files" && (
        <FileUploadPanel
          entityType="mediaOrder"
          entityId={mediaOrderId}
          files={mediaOrderFiles}
          fileTypeOptions={fileTypeOptions}
          revalidateTarget={`/events/${eventId}/media-orders/${mediaOrderId}`}
        />
      )}
    </>
  );
}
