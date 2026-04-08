import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getSetupOrder,
  updateSetupOrder,
  deleteSetupOrder,
  linkSetupOrderToFunction,
  unlinkSetupOrderFromFunction,
  createSetupTable,
  updateSetupTable,
  deleteSetupTable,
  createSetupEquipmentItem,
  updateSetupEquipmentItem,
  deleteSetupEquipmentItem,
} from "../../../setup-orders/actions";
import { getOptions, getEquipment } from "@/app/settings/actions";
import {
  getSetupOrderVendors,
  addVendorToSetupOrder,
  updateSetupOrderVendor,
  removeVendorFromSetupOrder,
  searchAssignedEventVendors,
} from "@/app/vendors/actions";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { SetupOrderForm } from "../../../setup-orders/SetupOrderForm";
import { SetupTableList } from "../../../setup-orders/SetupTableList";
import { aggregateSetupTables, getSetupOrderDisplayName } from "../../../setup-orders/utils";
import { EquipmentTable } from "../../../catering-orders/EquipmentTable";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";

export const dynamic = "force-dynamic";

export default async function SetupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; setupOrderId: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id: eventId, setupOrderId } = await params;

  const [event, setupOrder, setupTypes, responsiblePartyOptions, equipmentOptions, equipmentCategories, workflowInstances, allTemplates] =
    await Promise.all([
      getEvent(eventId),
      getSetupOrder(setupOrderId),
      getOptions("setup_type"),
      getOptions("responsible_party"),
      getEquipment(),
      getOptions("equipment_category"),
      getWorkflowInstances("setup_order", setupOrderId),
      getWorkflowTemplateOptions(),
    ]);
  if (!event || !setupOrder) {
    notFound();
  }

  const [setupOrderVendors, vendorTypeOptions, fileTypeOptions, setupOrderFiles] = await Promise.all([
    getSetupOrderVendors(setupOrderId),
    getOptions("vendor_type"),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { setupOrderId }, orderBy: { createdAt: "asc" } }),
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

  const vendorTypeLabels = Object.fromEntries(vendorTypeOptions.map((t) => [t.value, t.label]));

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId);
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {displayName}
          </h1>
        </div>
        <DeleteButton
          action={deleteSetupOrderAction}
          confirmMessage="Are you sure you want to delete this Setup Order?"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <SetupOrderForm
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
          />
          <VendorPanel
            assignedVendors={setupOrderVendors}
            eventId={eventId}
            searchEventVendors={searchEventVendorsAction}
            addVendor={addVendorAction}
            updateVendor={updateVendorAction}
            removeVendor={removeVendorAction}
            vendorTypeLabels={vendorTypeLabels}
          />
        </div>

        <div className="space-y-8">
          <WorkflowPanel
            instances={workflowInstances}
            availableTemplates={availableWorkflowTemplates}
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
          <FileUploadPanel
            entityType="setupOrder"
            entityId={setupOrderId}
            files={setupOrderFiles}
            fileTypeOptions={fileTypeOptions}
            revalidateTarget={`/events/${eventId}/setup-orders/${setupOrderId}`}
          />
          <EquipmentTable
            items={setupOrder.equipmentItems}
            responsiblePartyOptions={responsiblePartyOptions}
            equipmentOptions={equipmentOptions}
            equipmentCategories={equipmentCategories}
            createItem={createEquipmentAction}
            updateItem={updateEquipmentAction}
            deleteItem={deleteEquipmentAction}
            readOnlyItems={setupReadOnlyItems}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
