import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { getEvent } from "../../../actions";
import {
  getSupplyOrder,
  updateSupplyOrder,
  deleteSupplyOrder,
  updateSupplyOrderPackingStatus,
  linkSupplyOrderToFunction,
  unlinkSupplyOrderFromFunction,
  linkSupplyOrderToPresentation,
  unlinkSupplyOrderFromPresentation,
  createSupplyOrderItem,
  updateSupplyOrderItem,
  deleteSupplyOrderItem,
  updateSupplyOrderItemPackingStatus,
} from "../../../supply-orders/actions";
import {
  getSupplyOrderVendors,
  addVendorToSupplyOrder,
  updateSupplyOrderVendor,
  removeVendorFromSupplyOrder,
  searchAssignedEventVendors,
  getResponsiblePartyVendors,
} from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getEquipment, getOptions, getSubstatusOptions } from "@/app/settings/actions";
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
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { sortRoomsByGroupThenName } from "@/lib/roomGroups";
import { SupplyOrderTabs, SUPPLY_ORDER_TABS } from "../../../supply-orders/SupplyOrderTabs";
import { SupplyOrderForm } from "../../../supply-orders/SupplyOrderForm";
import { SupplyOrderItemPanel } from "../../../supply-orders/SupplyOrderItemPanel";
import { SupplyOrderLinkPanel } from "../../../supply-orders/SupplyOrderLinkPanel";
import { PackingStatusPanel } from "../../../supply-orders/PackingStatusPanel";

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

  const [event, supplyOrder, workflowInstances, allTemplates, substatuses, equipmentOptions] = await Promise.all([
    getEvent(eventId),
    getSupplyOrder(supplyOrderId),
    getWorkflowInstances("supply_order", supplyOrderId, eventId),
    getWorkflowTemplateOptions(),
    getSubstatusOptions(),
    getEquipment(),
  ]);

  if (!event || !supplyOrder) notFound();

  const [
    supplyOrderVendors,
    fileTypeOptions,
    supplyOrderFiles,
    responsiblePartyVendors,
    availableEventVendors,
    venueRooms,
    availableFunctions,
    availablePresentations,
  ] = await Promise.all([
    getSupplyOrderVendors(supplyOrderId, eventId),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { supplyOrderId }, orderBy: { createdAt: "asc" } }),
    getResponsiblePartyVendors(eventId, "SUPPLY_ORDER"),
    searchAssignedEventVendors("", eventId, "SUPPLY_ORDER"),
    event.venueId
      ? prisma.room.findMany({
          where: { venueId: event.venueId },
          include: { group: { select: { id: true, name: true, sortOrder: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.function.findMany({
      where: { eventId, NOT: { supplyOrderLinks: { some: { supplyOrderId } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.presentation.findMany({
      where: { eventId, NOT: { supplyOrderLinks: { some: { supplyOrderId } } } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const flatVendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  // Server action closures
  const updateSupplyOrderAction = async (formData: FormData) => {
    "use server";
    await updateSupplyOrder(supplyOrderId, eventId, formData);
  };

  const deleteSupplyOrderAction = async () => {
    "use server";
    await deleteSupplyOrder(supplyOrderId, eventId);
  };

  const updatePackingStatusAction = async (status: PackingStatus | null) => {
    "use server";
    await updateSupplyOrderPackingStatus(supplyOrderId, eventId, status);
  };

  const addVendorToFormAction = async (vendorId: string) => {
    "use server";
    await addVendorToSupplyOrder(supplyOrderId, vendorId, eventId);
  };

  const removeVendorFromFormAction = async (junctionId: string) => {
    "use server";
    await removeVendorFromSupplyOrder(junctionId, supplyOrderId, eventId);
  };

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId, "SUPPLY_ORDER");
  };

  const addVendorAction = async (vendorId: string, notes: string) => {
    "use server";
    await addVendorToSupplyOrder(supplyOrderId, vendorId, eventId, notes);
  };

  const updateVendorAction = async (id: string, notes: string) => {
    "use server";
    await updateSupplyOrderVendor(id, supplyOrderId, eventId, notes);
  };

  const removeVendorAction = async (id: string) => {
    "use server";
    await removeVendorFromSupplyOrder(id, supplyOrderId, eventId);
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

  const updateItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateSupplyOrderItem(id, supplyOrderId, eventId, formData);
  };

  const deleteItemAction = async (id: string) => {
    "use server";
    await deleteSupplyOrderItem(id, supplyOrderId, eventId);
  };

  const updateItemPackingStatusAction = async (id: string, packingStatus: PackingStatus) => {
    "use server";
    await updateSupplyOrderItemPackingStatus(id, supplyOrderId, eventId, packingStatus);
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
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
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
            status={supplyOrder.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteSupplyOrderAction}
          />
        </div>
      </div>

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
              <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
                <PackingStatusPanel
                  packingStatus={supplyOrder.packingStatus ?? null}
                  itemCount={supplyOrder.items.length}
                  updatePackingStatus={updatePackingStatusAction}
                />
              </div>
              <SupplyOrderForm
                noCard
                supplyOrder={supplyOrder}
                eventId={eventId}
                rooms={sortRoomsByGroupThenName(venueRooms)}
                action={updateSupplyOrderAction}
                vendorLink={{
                  assignedVendors: supplyOrderVendors,
                  availableVendors: flatVendors.map((v) => ({ id: v.id, label: v.name })),
                  addVendor: addVendorToFormAction,
                  removeVendor: removeVendorFromFormAction,
                }}
              />
            </div>

            <SupplyOrderLinkPanel
              linkedFunctions={supplyOrder.functions.map((l) => ({
                id: l.function.id,
                label: l.function.name,
                path: `/events/${eventId}/functions/${l.function.id}`,
              }))}
              availableFunctions={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
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
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              entityStatus={supplyOrder.status ?? null}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemWorkflowAction}
            />
          </div>

          <div className="lg:col-span-2">
            <SupplyOrderItemPanel
              items={supplyOrder.items}
              equipmentOptions={equipmentOptions}
              vendors={flatVendors}
              createItem={createItemAction}
              updateItem={updateItemAction}
              deleteItem={deleteItemAction}
              updateItemPackingStatus={updateItemPackingStatusAction}
            />
          </div>
        </div>
      )}

      {activeTab === "vendors" && (
        <VendorPanel
          assignedVendors={supplyOrderVendors}
          availableVendors={availableEventVendors}
          eventId={eventId}
          searchEventVendors={searchEventVendorsAction}
          addVendor={addVendorAction}
          updateVendor={updateVendorAction}
          removeVendor={removeVendorAction}
        />
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
