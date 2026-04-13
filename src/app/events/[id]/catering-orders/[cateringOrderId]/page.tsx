import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { getEvent } from "../../../actions";
import {
  getCateringOrder,
  updateCateringOrderOverview,
  updateCateringOrderService,
  updateCateringOrderContract,
  deleteCateringOrder,
  linkCateringOrderToFunction,
  unlinkCateringOrderFromFunction,
  createTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
  createCateringOrderLineItem,
  updateCateringOrderLineItem,
  deleteCateringOrderLineItem,
  createCateringOrderMenuSection,
  updateCateringOrderMenuSection,
  deleteCateringOrderMenuSection,
  addCateringOrderContact,
  updateCateringOrderContact,
  removeCateringOrderContact,
  searchContactsForCateringOrder,
  createAndAddCateringOrderContact,
} from "../../../catering-orders/actions";
import { getOptions, getEquipment } from "../../../../settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import {
  getCateringOrderVendors,
  addVendorToCateringOrder,
  updateCateringOrderVendor,
  removeVendorFromCateringOrder,
  searchAssignedEventVendors,
} from "@/app/vendors/actions";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { CateringOrderTabs, CATERING_ORDER_TABS } from "../../../catering-orders/CateringOrderTabs";
import { CateringOrderOverviewForm } from "../../../catering-orders/CateringOrderOverviewForm";
import { CateringOrderServiceForm } from "../../../catering-orders/CateringOrderServiceForm";
import { CateringOrderContractForm } from "../../../catering-orders/CateringOrderContractForm";
import { TimelineTable } from "../../../catering-orders/TimelineTable";
import { EquipmentTable } from "../../../catering-orders/EquipmentTable";
import { LineItemTable } from "../../../catering-orders/LineItemTable";
import { MenuSectionTable } from "../../../catering-orders/MenuSectionTable";
import { ContactList } from "../../../functions/ContactList";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import type { TimelineItem } from "@prisma/client";

export const dynamic = "force-dynamic";

function TimelinePreview({
  items,
  serviceTabPath,
}: {
  items: TimelineItem[];
  serviceTabPath: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Timeline</h2>
        <Link
          href={serviceTabPath}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Manage
        </Link>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
              {new Date(item.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {item.endTime &&
                ` – ${new Date(item.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </span>
            <span className="text-gray-900 dark:text-white">{item.label}</span>
            {item.notes && (
              <span className="text-gray-400 dark:text-gray-500">· {item.notes}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function CateringOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; cateringOrderId: string }>;
  searchParams: Promise<{ tab?: string; success?: string }>;
}) {
  const { id: eventId, cateringOrderId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = CATERING_ORDER_TABS.some((t) => t.value === tab) ? tab : "overview";

  const [event, cateringOrder, serviceStyleOptions, responsiblePartyOptions, equipmentOptions, equipmentCategories, allAvailableFunctions, workflowInstances, allTemplates, cateringOrderVendors, vendorTypeOptions, fileTypeOptions, cateringOrderFiles] =
    await Promise.all([
      getEvent(eventId),
      getCateringOrder(cateringOrderId),
      getOptions("service_style"),
      getOptions("responsible_party"),
      getEquipment(),
      getOptions("equipment_category"),
      prisma.function.findMany({ where: { eventId, cateringOrder: null }, orderBy: { name: "asc" } }),
      getWorkflowInstances("catering_order", cateringOrderId),
      getWorkflowTemplateOptions(),
      getCateringOrderVendors(cateringOrderId),
      getOptions("vendor_type"),
      getOptions("file_type"),
      prisma.fileUpload.findMany({ where: { cateringOrderId }, orderBy: { createdAt: "asc" } }),
    ]);
  if (!event || !cateringOrder) {
    notFound();
  }

  const availableFunctions = cateringOrder.functionId ? [] : allAvailableFunctions;
  const basePath = `/events/${eventId}/catering-orders/${cateringOrderId}`;
  const vendorTypeLabels = Object.fromEntries(vendorTypeOptions.map((t) => [t.value, t.label]));

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const deleteCateringOrderAction = async () => {
    "use server";
    await deleteCateringOrder(cateringOrderId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkCateringOrderToFunction(cateringOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async () => {
    "use server";
    await unlinkCateringOrderFromFunction(cateringOrderId, eventId);
  };

  const updateOverviewAction = async (formData: FormData) => {
    "use server";
    await updateCateringOrderOverview(cateringOrderId, eventId, formData);
  };

  const updateServiceAction = async (formData: FormData) => {
    "use server";
    await updateCateringOrderService(cateringOrderId, eventId, formData);
  };

  const updateContractAction = async (formData: FormData) => {
    "use server";
    await updateCateringOrderContract(cateringOrderId, eventId, formData);
  };

  const createTimelineAction = async (formData: FormData) => {
    "use server";
    await createTimelineItem(cateringOrderId, eventId, formData);
  };
  const updateTimelineAction = async (id: string, formData: FormData) => {
    "use server";
    await updateTimelineItem(id, cateringOrderId, eventId, formData);
  };
  const deleteTimelineAction = async (id: string) => {
    "use server";
    await deleteTimelineItem(id, cateringOrderId, eventId);
  };

  const createEquipmentAction = async (formData: FormData) => {
    "use server";
    await createEquipmentItem(cateringOrderId, eventId, formData);
  };
  const updateEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateEquipmentItem(id, cateringOrderId, eventId, formData);
  };
  const deleteEquipmentAction = async (id: string) => {
    "use server";
    await deleteEquipmentItem(id, cateringOrderId, eventId);
  };

  const createLineItemAction = async (formData: FormData) => {
    "use server";
    await createCateringOrderLineItem(cateringOrderId, eventId, formData);
  };
  const updateLineItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateCateringOrderLineItem(id, cateringOrderId, eventId, formData);
  };
  const deleteLineItemAction = async (id: string) => {
    "use server";
    await deleteCateringOrderLineItem(id, cateringOrderId, eventId);
  };

  const createMenuSectionAction = async (formData: FormData) => {
    "use server";
    await createCateringOrderMenuSection(cateringOrderId, eventId, formData);
  };
  const updateMenuSectionAction = async (id: string, formData: FormData) => {
    "use server";
    await updateCateringOrderMenuSection(id, cateringOrderId, eventId, formData);
  };
  const deleteMenuSectionAction = async (id: string) => {
    "use server";
    await deleteCateringOrderMenuSection(id, cateringOrderId, eventId);
  };

  const addContactAction = async (formData: FormData) => {
    "use server";
    await addCateringOrderContact(cateringOrderId, eventId, formData);
  };
  const updateContactAction = async (id: string, formData: FormData) => {
    "use server";
    await updateCateringOrderContact(id, cateringOrderId, eventId, formData);
  };
  const removeContactAction = async (id: string) => {
    "use server";
    await removeCateringOrderContact(id, cateringOrderId, eventId);
  };
  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContactsForCateringOrder(query);
  };

  const createContactAction = async (formData: FormData) => {
    "use server";
    await createAndAddCateringOrderContact(cateringOrderId, eventId, formData);
  };

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "catering_order", cateringOrderId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "catering_order", cateringOrderId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "catering_order", cateringOrderId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "catering_order", cateringOrderId, eventId);
  };

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId);
  };

  const addVendorAction = async (vendorId: string, notes: string) => {
    "use server";
    await addVendorToCateringOrder(cateringOrderId, vendorId, eventId, notes);
  };

  const updateVendorAction = async (id: string, notes: string) => {
    "use server";
    await updateCateringOrderVendor(id, cateringOrderId, eventId, notes);
  };

  const removeVendorAction = async (id: string) => {
    "use server";
    await removeVendorFromCateringOrder(id, cateringOrderId, eventId);
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
            { label: "Catering Orders", href: `/events/${eventId}/catering-orders` },
            { label: cateringOrder.name },
          ]} />
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {cateringOrder.name}
            </h1>
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
        </div>
        <DeleteButton
          action={deleteCateringOrderAction}
          confirmMessage="Are you sure you want to delete this Catering Order?"
        />
      </div>

      <CateringOrderTabs basePath={basePath} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <CateringOrderOverviewForm
              cateringOrder={cateringOrder}
              action={updateOverviewAction}
              serviceStyleOptions={serviceStyleOptions}
              linkedFunctionId={cateringOrder.functionId}
              linkedFunctionName={cateringOrder.function?.name ?? null}
              linkedFunctionPath={
                cateringOrder.functionId ? `/events/${eventId}/functions/${cateringOrder.functionId}` : null
              }
              availableFunctions={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
              linkFunction={linkToFunctionAction}
              unlinkFunction={unlinkFromFunctionAction}
            />
            <ContactList
              contacts={cateringOrder.contacts}
              addContact={addContactAction}
              updateContact={updateContactAction}
              removeContact={removeContactAction}
              searchContacts={searchContactsAction}
              createContact={createContactAction}
            />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <WorkflowPanel
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemAction}
            />
            <TimelinePreview
              items={cateringOrder.timelineItems}
              serviceTabPath={`${basePath}?tab=service`}
            />
            <MenuSectionTable
              sections={cateringOrder.menuSections}
              responsiblePartyOptions={responsiblePartyOptions}
              createSection={createMenuSectionAction}
              updateSection={updateMenuSectionAction}
              deleteSection={deleteMenuSectionAction}
            />
          </div>
        </div>
      )}

      {activeTab === "vendors" && (
        <div className="max-w-2xl">
          <VendorPanel
            assignedVendors={cateringOrderVendors}
            eventId={eventId}
            searchEventVendors={searchEventVendorsAction}
            addVendor={addVendorAction}
            updateVendor={updateVendorAction}
            removeVendor={removeVendorAction}
            vendorTypeLabels={vendorTypeLabels}
          />
        </div>
      )}

      {activeTab === "files" && (
        <div className="max-w-2xl">
          <FileUploadPanel
            entityType="cateringOrder"
            entityId={cateringOrderId}
            files={cateringOrderFiles}
            fileTypeOptions={fileTypeOptions}
            revalidateTarget={`/events/${eventId}/catering-orders/${cateringOrderId}`}
          />
        </div>
      )}

      {activeTab === "service" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <CateringOrderServiceForm cateringOrder={cateringOrder} action={updateServiceAction} />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <TimelineTable
              items={cateringOrder.timelineItems}
              createItem={createTimelineAction}
              updateItem={updateTimelineAction}
              deleteItem={deleteTimelineAction}
            />
            <EquipmentTable
              items={cateringOrder.equipmentItems}
              responsiblePartyOptions={responsiblePartyOptions}
              equipmentOptions={equipmentOptions}
              equipmentCategories={equipmentCategories}
              createItem={createEquipmentAction}
              updateItem={updateEquipmentAction}
              deleteItem={deleteEquipmentAction}
            />
          </div>
        </div>
      )}

      {activeTab === "contract" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <CateringOrderContractForm cateringOrder={cateringOrder} action={updateContractAction} />
          </div>
          <div className="lg:col-span-2">
            <LineItemTable
              items={cateringOrder.lineItems}
              createItem={createLineItemAction}
              updateItem={updateLineItemAction}
              deleteItem={deleteLineItemAction}
            />
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
