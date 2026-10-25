import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
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
  getSupplyOrder,
  updateSupplyOrder,
  deleteSupplyOrder,
  bulkSetSupplyOrderItemsPackingStatus,
  bulkSetSupplyOrderItemsAcquisitionState,
  linkSupplyOrderToFunction,
  unlinkSupplyOrderFromFunction,
  linkSupplyOrderToPresentation,
  unlinkSupplyOrderFromPresentation,
  createSupplyOrderItem,
  updateSupplyOrderItem,
  deleteSupplyOrderItem,
  updateSupplyOrderItemPackingStatus,
  updateSupplyOrderItemAcquisitionState,
} from "../../../supply-orders/actions";
import { getOptions, getSubstatusOptions } from "@/app/(admin)/settings/actions";
import { getEquipment } from "@/app/equipment/actions";
import {
  getStorageLocations,
  getLocationTypes,
  createContainerInline,
} from "@/app/storage-locations/actions";
import {
  previewContainerCascade,
  markContainerContents,
} from "@/app/events/packing/actions";
import {
  buildLocationIndex,
  flattenLocations,
  toLocationOption,
} from "@/lib/storageLocations";
import { hasPermission } from "@/lib/permissions";
import { PermissionResource } from "@prisma/client";
import { getResponsibleParties } from "@/lib/responsibleParties";
import {
  getWorkflowInstances,
  assignWorkflow,
  removeWorkflow,
  toggleStepCompletion,
  toggleItemCompletion,
  setEntityStatus,
  cancelEntity,
  restoreEntity,
} from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/(admin)/workflows/actions";
import { getEventRooms } from "@/lib/eventVenues";
import { SupplyOrderTabs, SUPPLY_ORDER_TABS } from "../../../supply-orders/SupplyOrderTabs";
import { SupplyOrderForm } from "../../../supply-orders/SupplyOrderForm";
import { SupplyOrderItemPanel } from "../../../supply-orders/SupplyOrderItemPanel";
import { SupplyOrderLinkPanel } from "../../../supply-orders/SupplyOrderLinkPanel";
import { BulkItemStatusPanel } from "../../../supply-orders/BulkItemStatusPanel";
import { PackingStatusRollup } from "@/components/PackingStatusRollup";
import { formatFunctionLabel } from "@/lib/functionNumbers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; supplyOrderId: string }>;
}): Promise<Metadata> {
  const { supplyOrderId } = await params;
  const order = await prisma.supplyOrder.findUnique({
    where: { id: supplyOrderId },
    select: { name: true },
  });
  return { title: order?.name ?? "Supply order" };
}

export default async function SupplyOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; supplyOrderId: string }>;
  searchParams: Promise<{ tab?: string; success?: string }>;
}) {
  const { id: eventId, supplyOrderId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = SUPPLY_ORDER_TABS.some((t) => t.value === tab) ? tab : "overview";

  const [
    event,
    supplyOrder,
    workflowInstances,
    allTemplates,
    substatuses,
    equipmentOptions,
    equipmentCategories,
    storageLocations,
    locationTypes,
    canManageLocations,
    packingSubstatuses,
  ] = await Promise.all([
    getEvent(eventId),
    getSupplyOrder(supplyOrderId),
    getWorkflowInstances("supply_order", supplyOrderId, eventId),
    getWorkflowTemplateOptions(),
    getSubstatusOptions(),
    getEquipment(),
    getOptions("equipment_category"),
    getStorageLocations(),
    getLocationTypes(),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "WRITE"),
    getOptions("packing_substatus"),
  ]);

  if (!event || !supplyOrder) notFound();

  // Flattened server-side: the tree helpers import prisma, so only plain
  // options cross into the client panel.
  const locationIndex = buildLocationIndex(storageLocations);
  const allLocationOptions = flattenLocations(locationIndex).map(toLocationOption);
  const containerOptions = flattenLocations(locationIndex, { kind: "CONTAINER" }).map(
    toLocationOption,
  );
  // Everyday scope for the "comes from" picker: every place, plus the
  // containers this order owns. A pallet full of other orders' boxes lives
  // behind "Show all containers" — see the signage-box case.
  const ownContainerIds = new Set(
    supplyOrder.items
      .map((i) => i.containerLocationId)
      .filter((id): id is string => id !== null),
  );
  const locationOptions = allLocationOptions.filter(
    (o) => o.kind === "PLACE" || ownContainerIds.has(o.id),
  );

  const supplyEquipmentCategoryLabels = new Set(
    equipmentCategories.filter((c) => c.models.includes("SUPPLY_ORDER")).map((c) => c.label)
  );
  const hasSupplyEquipmentFilter = supplyEquipmentCategoryLabels.size > 0;
  const filteredEquipmentOptions = hasSupplyEquipmentFilter
    ? equipmentOptions.filter((e) => supplyEquipmentCategoryLabels.has(e.category))
    : equipmentOptions;

  const linkedFunctionIds = supplyOrder.functions.map((l) => l.function.id);
  const linkedPresentationIds = supplyOrder.presentations.map((l) => l.presentation.id);

  const [
    fileTypeOptions,
    supplyOrderFiles,
    pool,
    venueRooms,
    availableFunctions,
    availablePresentations,
  ] = await Promise.all([
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { supplyOrderId }, orderBy: { createdAt: "asc" } }),
    getResponsibleParties({
      eventId,
      modelType: "SUPPLY_ORDER",
      functionIds: linkedFunctionIds,
      presentationIds: linkedPresentationIds,
    }),
    getEventRooms(eventId),
    prisma.function.findMany({
      where: { eventId, NOT: { supplyOrderLinks: { some: { supplyOrderId } } } },
      select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.presentation.findMany({
      where: { eventId, NOT: { supplyOrderLinks: { some: { supplyOrderId } } } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  // Server action closures
  const updateSupplyOrderAction = async (formData: FormData) => {
    "use server";
    await updateSupplyOrder(supplyOrderId, eventId, formData);
  };

  const deleteSupplyOrderAction = async () => {
    "use server";
    await deleteSupplyOrder(supplyOrderId, eventId);
  };

  const bulkSetPackingAction = async (status: PackingStatus, substatus: string | null) => {
    "use server";
    await bulkSetSupplyOrderItemsPackingStatus(supplyOrderId, eventId, status, substatus);
  };
  const packingSubstatusOptions = packingSubstatuses.map((o) => ({ label: o.label, group: o.group }));

  const bulkSetAcquisitionAction = async (state: AcquisitionState) => {
    "use server";
    await bulkSetSupplyOrderItemsAcquisitionState(supplyOrderId, eventId, state);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkSupplyOrderToFunction(supplyOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async (functionId: string) => {
    "use server";
    await unlinkSupplyOrderFromFunction(supplyOrderId, functionId, eventId);
  };

  const linkToPresentationAction = async (presentationId: string) => {
    "use server";
    await linkSupplyOrderToPresentation(supplyOrderId, presentationId, eventId);
  };

  const unlinkFromPresentationAction = async (presentationId: string) => {
    "use server";
    await unlinkSupplyOrderFromPresentation(supplyOrderId, presentationId, eventId);
  };

  const createItemAction = async (formData: FormData) => {
    "use server";
    await createSupplyOrderItem(supplyOrderId, eventId, formData);
  };

  const createContainerAction = async (
    name: string,
    parentId: string | null,
    type: string | null,
  ) => {
    "use server";
    return createContainerInline(name, parentId, type);
  };

  const previewContainerCascadeAction = async (containerLocationId: string) => {
    "use server";
    return previewContainerCascade(containerLocationId, eventId);
  };

  const markContainerContentsAction = async (
    containerLocationId: string,
    packingStatus: PackingStatus,
  ) => {
    "use server";
    return markContainerContents(containerLocationId, eventId, packingStatus);
  };

  const updateItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateSupplyOrderItem(id, supplyOrderId, eventId, formData);
  };

  const deleteItemAction = async (id: string) => {
    "use server";
    await deleteSupplyOrderItem(id, supplyOrderId, eventId);
  };

  const updateItemPackingStatusAction = async (id: string, packingStatus: PackingStatus, packingSubstatus?: string | null) => {
    "use server";
    await updateSupplyOrderItemPackingStatus(id, supplyOrderId, eventId, packingStatus, packingSubstatus);
  };

  const updateItemAcquisitionStateAction = async (id: string, acquisitionState: AcquisitionState) => {
    "use server";
    await updateSupplyOrderItemAcquisitionState(id, supplyOrderId, eventId, acquisitionState);
  };

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "supply_order", supplyOrderId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "supply_order", supplyOrderId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "supply_order", supplyOrderId, eventId);
  };

  const toggleItemWorkflowAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "supply_order", supplyOrderId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("supply_order", supplyOrderId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("supply_order", supplyOrderId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("supply_order", supplyOrderId, eventId);
  };

  const entityStatus = supplyOrder.status ?? null;

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
              { label: "Supply Orders", href: `/events/${eventId}/supply-orders` },
              { label: supplyOrder.name },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {supplyOrder.name}
            </h1>
            <EntityStatusBadge status={entityStatus} substatus={supplyOrder.substatus ?? null} />
            <WorkflowStatusBadge summary={workflowBadgeSummary(workflowInstances)} />
          </div>
          <LastUpdated
            updatedAt={supplyOrder.updatedAt}
            updatedBy={supplyOrder.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          <CancelOrDeleteButton
            resource="SUPPLY_ORDERS"
            status={supplyOrder.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteSupplyOrderAction}
          />
        </div>
      </div>

      <WorkflowStrips instances={workflowInstances} />

      <SupplyOrderTabs basePath={`/events/${eventId}/supply-orders/${supplyOrderId}`} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
                <EntityStatusPanel
                  standalone={false}
                  entityType="supply_order"
                  entityId={supplyOrderId}
                  eventId={eventId}
                  status={supplyOrder.status ?? null}
                  substatus={supplyOrder.substatus ?? null}
                  substatuses={substatuses}
                  setStatus={setStatusAction}
                />
              </div>
              {supplyOrder.items.length > 0 && (
                <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Packing:</span>
                  <PackingStatusRollup items={supplyOrder.items} />
                </div>
              )}
              <SupplyOrderForm
                noCard
                supplyOrder={supplyOrder}
                eventId={eventId}
                rooms={venueRooms}
                pool={pool}
                action={updateSupplyOrderAction}
              />
            </div>

            <SupplyOrderLinkPanel
              linkedFunctions={supplyOrder.functions.map((l) => ({
                id: l.function.id,
                label: formatFunctionLabel(l.function),
                path: `/events/${eventId}/functions/${l.function.id}`,
              }))}
              availableFunctions={availableFunctions.map((f) => ({ id: f.id, label: formatFunctionLabel(f) }))}
              linkFunction={linkToFunctionAction}
              unlinkFunction={unlinkFromFunctionAction}
              linkedPresentations={supplyOrder.presentations.map((l) => ({
                id: l.presentation.id,
                label: l.presentation.title,
                path: `/events/${eventId}/presentations/${l.presentation.id}`,
              }))}
              availablePresentations={availablePresentations.map((p) => ({ id: p.id, label: p.title }))}
              linkPresentation={linkToPresentationAction}
              unlinkPresentation={unlinkFromPresentationAction}
            />

            <WorkflowPanel
              entityType="supply_order"
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              entityStatus={supplyOrder.status ?? null}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemWorkflowAction}
            />
          </div>

          <div className="lg:col-span-2 space-y-4">
            <BulkItemStatusPanel
              itemCount={supplyOrder.items.length}
              packingSubstatusOptions={packingSubstatusOptions}
              bulkSetPacking={bulkSetPackingAction}
              bulkSetAcquisition={bulkSetAcquisitionAction}
            />
            <SupplyOrderItemPanel
              items={supplyOrder.items}
              equipmentOptions={filteredEquipmentOptions}
              allEquipmentOptions={hasSupplyEquipmentFilter ? equipmentOptions : undefined}
              locationOptions={locationOptions}
              allLocationOptions={allLocationOptions}
              containerOptions={containerOptions}
              locationTypes={locationTypes}
              canManageLocations={canManageLocations}
              createContainer={createContainerAction}
              previewContainerCascade={previewContainerCascadeAction}
              markContainerContents={markContainerContentsAction}
              pool={pool}
              orderProvider={{
                providerVendor: supplyOrder.providerVendor,
                providerContact: supplyOrder.providerContact,
              }}
              createItem={createItemAction}
              updateItem={updateItemAction}
              deleteItem={deleteItemAction}
              packingSubstatusOptions={packingSubstatusOptions}
              updateItemPackingStatus={updateItemPackingStatusAction}
              updateItemAcquisitionState={updateItemAcquisitionStateAction}
            />
          </div>
        </div>
      )}

      {activeTab === "files" && (
        <FileUploadPanel
          entityType="supplyOrder"
          entityId={supplyOrderId}
          files={supplyOrderFiles}
          fileTypeOptions={fileTypeOptions}
          revalidateTarget={`/events/${eventId}/supply-orders/${supplyOrderId}`}
        />
      )}
    </>
  );
}
