import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getSetupOrder,
  updateSetupOrder,
  deleteSetupOrder,
  duplicateSetupOrder,
  linkSetupOrderToFunction,
  unlinkSetupOrderFromFunction,
  createSetupTable,
  updateSetupTable,
  deleteSetupTable,
  createSetupEquipmentItem,
  updateSetupEquipmentItem,
  deleteSetupEquipmentItem,
} from "../../../setup-orders/actions";
import { getOptions, getEquipment, getSubstatusOptions } from "@/app/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import {
  getSetupOrderVendors,
  addVendorToSetupOrder,
  updateSetupOrderVendor,
  removeVendorFromSetupOrder,
  searchAssignedEventVendors,
} from "@/app/vendors/actions";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { SetupOrderTabs, SETUP_ORDER_TABS } from "../../../setup-orders/SetupOrderTabs";
import { SetupOrderForm } from "../../../setup-orders/SetupOrderForm";
import { SetupTableList } from "../../../setup-orders/SetupTableList";
import { aggregateSetupTables, getSetupOrderDisplayName } from "../../../setup-orders/utils";
import { EquipmentTable } from "../../../catering-orders/EquipmentTable";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";

export const dynamic = "force-dynamic";

export default async function SetupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; setupOrderId: string }>;
  searchParams: Promise<{ tab?: string; success?: string }>;
}) {
  const { id: eventId, setupOrderId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = SETUP_ORDER_TABS.some((t) => t.value === tab) ? tab : "overview";

  const [event, setupOrder, setupTypes, responsiblePartyVendors, equipmentOptions, equipmentCategories, workflowInstances, allTemplates] =
    await Promise.all([
      getEvent(eventId),
      getSetupOrder(setupOrderId),
      getOptions("setup_type"),
      getResponsiblePartyVendors(eventId),
      getEquipment(),
      getOptions("equipment_category"),
      getWorkflowInstances("setup_order", setupOrderId),
      getWorkflowTemplateOptions(),
    ]);
  if (!event || !setupOrder) {
    notFound();
  }

  const [setupOrderVendors, fileTypeOptions, setupOrderFiles, availableEventVendors, substatuses] = await Promise.all([
    getSetupOrderVendors(setupOrderId),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { setupOrderId }, orderBy: { createdAt: "asc" } }),
    searchAssignedEventVendors("", eventId, "SETUP_ORDER"),
    getSubstatusOptions(),
  ]);

  const TABLE_CAT = "TABLES";
  const CHAIR_CAT = "CHAIRS";
  const tableOptions = equipmentOptions.filter((e) => e.category === TABLE_CAT);
  const chairOptions = equipmentOptions.filter((e) => e.category === CHAIR_CAT);

  const [venueRooms, availableFunctions] = await Promise.all([
    event.venueId
      ? prisma.room.findMany({ where: { venueId: event.venueId }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    setupOrder.functionId
      ? Promise.resolve([])
      : prisma.function.findMany({
          where: {
            eventId,
            setupOrder: null,
            ...(setupOrder.roomId ? { rooms: { some: { roomId: setupOrder.roomId } } } : {}),
          },
          orderBy: { name: "asc" },
        }),
  ]);

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId, "SETUP_ORDER");
  };

  const addVendorAction = async (vendorId: string, notes: string) => {
    "use server";
    await addVendorToSetupOrder(setupOrderId, vendorId, eventId, notes);
  };

  const updateVendorAction = async (id: string, notes: string) => {
    "use server";
    await updateSetupOrderVendor(id, setupOrderId, eventId, notes);
  };

  const removeVendorAction = async (id: string) => {
    "use server";
    await removeVendorFromSetupOrder(id, setupOrderId, eventId);
  };

  const addVendorToFormAction = async (vendorId: string) => {
    "use server";
    await addVendorToSetupOrder(setupOrderId, vendorId, eventId);
  };

  const removeVendorFromFormAction = async (junctionId: string) => {
    "use server";
    await removeVendorFromSetupOrder(junctionId, setupOrderId, eventId);
  };

  const { tableTotals, chairTotals } = aggregateSetupTables(setupOrder.tables);
  const setupReadOnlyItems = [
    ...Object.entries(tableTotals).map(([label, quantity]) => ({ label, quantity })),
    ...Object.entries(chairTotals).map(([label, quantity]) => ({ label, quantity })),
  ];

  const updateSetupOrderAction = async (formData: FormData) => {
    "use server";
    await updateSetupOrder(setupOrderId, eventId, formData);
  };

  const deleteSetupOrderAction = async () => {
    "use server";
    await deleteSetupOrder(setupOrderId, eventId);
  };

  const duplicateSetupOrderAction = async () => {
    "use server";
    await duplicateSetupOrder(setupOrderId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkSetupOrderToFunction(setupOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async () => {
    "use server";
    await unlinkSetupOrderFromFunction(setupOrderId, eventId);
  };

  const createTableAction = async (formData: FormData) => {
    "use server";
    await createSetupTable(setupOrderId, eventId, formData);
  };

  const updateTableAction = async (id: string, formData: FormData) => {
    "use server";
    await updateSetupTable(id, setupOrderId, eventId, formData);
  };

  const deleteTableAction = async (id: string) => {
    "use server";
    await deleteSetupTable(id, setupOrderId, eventId);
  };

  const createEquipmentAction = async (formData: FormData) => {
    "use server";
    await createSetupEquipmentItem(setupOrderId, eventId, formData);
  };

  const updateEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateSetupEquipmentItem(id, setupOrderId, eventId, formData);
  };

  const deleteEquipmentAction = async (id: string) => {
    "use server";
    await deleteSetupEquipmentItem(id, setupOrderId, eventId);
  };

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "setup_order", setupOrderId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "setup_order", setupOrderId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "setup_order", setupOrderId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "setup_order", setupOrderId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("setup_order", setupOrderId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("setup_order", setupOrderId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("setup_order", setupOrderId, eventId);
  };

  const displayName = getSetupOrderDisplayName(setupOrder);

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Setup Orders", href: `/events/${eventId}/setup-orders` },
              { label: displayName },
            ]}
          />
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {displayName}
            </h1>
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/events/${eventId}/setup-orders/${setupOrderId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print
          </a>
          <form action={duplicateSetupOrderAction}>
            <button
              type="submit"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Duplicate
            </button>
          </form>
          <CancelOrDeleteButton
            status={setupOrder.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteSetupOrderAction}
            confirmMessage="Are you sure you want to delete this Setup Order?"
          />
        </div>
      </div>

      <SetupOrderTabs basePath={`/events/${eventId}/setup-orders/${setupOrderId}`} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
                <EntityStatusPanel
                  standalone={false}
                  entityType="setup_order"
                  entityId={setupOrderId}
                  eventId={eventId}
                  status={setupOrder.status ?? null}
                  substatus={setupOrder.substatus ?? null}
                  substatuses={substatuses}
                  setStatus={setStatusAction}
                />
              </div>
              <SetupOrderForm
                noCard
                setupOrder={setupOrder}
                eventId={eventId}
                setupTypes={setupTypes}
                action={updateSetupOrderAction}
                rooms={venueRooms}
                functionLink={{
                  linkedFunctionId: setupOrder.functionId,
                  linkedFunctionName: setupOrder.function?.name ?? null,
                  linkedFunctionPath: setupOrder.function
                    ? `/events/${eventId}/functions/${setupOrder.function.id}`
                    : null,
                  availableFunctions: availableFunctions.map((f) => ({ id: f.id, label: f.name })),
                  linkFunction: linkToFunctionAction,
                  unlinkFunction: unlinkFromFunctionAction,
                }}
                vendorLink={{
                  assignedVendors: setupOrderVendors,
                  availableVendors: availableEventVendors.map((v) => ({ id: v.id, label: v.name })),
                  addVendor: addVendorToFormAction,
                  removeVendor: removeVendorFromFormAction,
                }}
              />
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <WorkflowPanel
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              entityStatus={setupOrder.status ?? null}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemAction}
            />
            <SetupTableList
              tables={setupOrder.tables}
              tableOptions={tableOptions}
              chairOptions={chairOptions}
              createTable={createTableAction}
              updateTable={updateTableAction}
              deleteTable={deleteTableAction}
            />
            <EquipmentTable
              items={setupOrder.equipmentItems}
              responsiblePartyVendors={responsiblePartyVendors}
              equipmentOptions={equipmentOptions}
              equipmentCategories={equipmentCategories}
              createItem={createEquipmentAction}
              updateItem={updateEquipmentAction}
              deleteItem={deleteEquipmentAction}
              readOnlyItems={setupReadOnlyItems}
            />
          </div>
        </div>
      )}

      {activeTab === "vendors" && (
        <div className="max-w-2xl">
          <VendorPanel
            assignedVendors={setupOrderVendors}
            eventId={eventId}
            searchEventVendors={searchEventVendorsAction}
            addVendor={addVendorAction}
            updateVendor={updateVendorAction}
            removeVendor={removeVendorAction}
          />
        </div>
      )}

      {activeTab === "files" && (
        <div className="max-w-2xl">
          <FileUploadPanel
            entityType="setupOrder"
            entityId={setupOrderId}
            files={setupOrderFiles}
            fileTypeOptions={fileTypeOptions}
            revalidateTarget={`/events/${eventId}/setup-orders/${setupOrderId}`}
          />
        </div>
      )}
    </PageWrapper>
  );
}
