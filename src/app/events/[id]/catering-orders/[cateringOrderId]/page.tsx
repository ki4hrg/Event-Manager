import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { getEvent } from "../../../actions";
import {
  getCateringOrder,
  updateCateringOrderDetails,
  updateCateringOrderGuestCounts,
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
import { getOptions, getEquipment, getSubstatusOptions } from "../../../../settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import {
  getCateringOrderVendors,
  addVendorToCateringOrder,
  updateCateringOrderVendor,
  removeVendorFromCateringOrder,
  searchAssignedEventVendors,
} from "@/app/vendors/actions";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { CateringOrderTabs, CATERING_ORDER_TABS } from "../../../catering-orders/CateringOrderTabs";
import { CateringOrderForm } from "../../../catering-orders/CateringOrderForm";
import { GuestCountsCard } from "../../../catering-orders/GuestCountsCard";
import { CateringOrderServiceForm } from "../../../catering-orders/CateringOrderServiceForm";
import { CateringOrderContractForm } from "../../../catering-orders/CateringOrderContractForm";
import { TimelineTable } from "../../../catering-orders/TimelineTable";
import { EquipmentTable } from "../../../catering-orders/EquipmentTable";
import { LineItemTable } from "../../../catering-orders/LineItemTable";
import { MenuSectionTable } from "../../../catering-orders/MenuSectionTable";
import { ContactList } from "../../../functions/ContactList";
import { FunctionLinkControl } from "../../../functions/FunctionLinkControl";
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

  const [event, cateringOrder, serviceStyleOptions, responsiblePartyVendors, equipmentOptions, equipmentCategories, allAvailableFunctions, workflowInstances, allTemplates, cateringOrderVendors, fileTypeOptions, cateringOrderFiles, availableEventVendors, substatuses] =
    await Promise.all([
      getEvent(eventId),
      getCateringOrder(cateringOrderId),
      getOptions("service_style"),
      getResponsiblePartyVendors(eventId, "CATERING_ORDER"),
      getEquipment(),
      getOptions("equipment_category"),
      prisma.function.findMany({ where: { eventId, cateringOrder: null }, orderBy: { name: "asc" } }),
      getWorkflowInstances("catering_order", cateringOrderId),
      getWorkflowTemplateOptions(),
      getCateringOrderVendors(cateringOrderId),
      getOptions("file_type"),
      prisma.fileUpload.findMany({ where: { cateringOrderId }, orderBy: { createdAt: "asc" } }),
      searchAssignedEventVendors("", eventId, "CATERING_ORDER"),
      getSubstatusOptions(),
    ]);
  if (!event || !cateringOrder) {
    notFound();
  }

  const availableFunctions = cateringOrder.functionId ? [] : allAvailableFunctions;
  const basePath = `/events/${eventId}/catering-orders/${cateringOrderId}`;

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

  const updateDetailsAction = async (formData: FormData) => {
    "use server";
    await updateCateringOrderDetails(cateringOrderId, eventId, formData);
  };

  const updateGuestCountsAction = async (formData: FormData) => {
    "use server";
    await updateCateringOrderGuestCounts(cateringOrderId, eventId, formData);
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

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("catering_order", cateringOrderId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("catering_order", cateringOrderId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("catering_order", cateringOrderId, eventId);
  };

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId, "CATERING_ORDER");
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

  const addVendorToFormAction = async (vendorId: string) => {
    "use server";
    await addVendorToCateringOrder(cateringOrderId, vendorId, eventId);
  };

  const removeVendorFromFormAction = async (junctionId: string) => {
    "use server";
    await removeVendorFromCateringOrder(junctionId, cateringOrderId, eventId);
  };

  const entityStatus = cateringOrder.status ?? null;

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
            { label: "Catering Orders", href: `/events/${eventId}/catering-orders` },
            { label: cateringOrder.name },
          ]} />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {cateringOrder.name}
            </h1>
            <EntityStatusBadge status={entityStatus} substatus={cateringOrder.substatus ?? null} />
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          <a
            href={`/events/${eventId}/catering-orders/${cateringOrderId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print
          </a>
          <CancelOrDeleteButton
            status={cateringOrder.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteCateringOrderAction}
          />
        </div>
      </div>

      <CateringOrderTabs basePath={basePath} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
                <EntityStatusPanel
                  standalone={false}
                  entityType="catering_order"
                  entityId={cateringOrderId}
                  eventId={eventId}
                  status={cateringOrder.status ?? null}
                  substatus={cateringOrder.substatus ?? null}
                  substatuses={substatuses}
                  setStatus={setStatusAction}
                />
              </div>
              <CateringOrderForm
                noCard
                cateringOrder={cateringOrder}
                action={updateDetailsAction}
                serviceStyleOptions={serviceStyleOptions}
                eventId={eventId}
                assignedVendors={cateringOrderVendors}
                availableVendors={availableEventVendors.map((v) => ({ id: v.id, label: v.name }))}
                addVendor={addVendorToFormAction}
                removeVendor={removeVendorFromFormAction}
              />
            </div>

            <GuestCountsCard
              expectedCount={cateringOrder.expectedCount}
              confirmedCount={cateringOrder.confirmedCount}
              guaranteeCount={cateringOrder.guaranteeCount}
              action={updateGuestCountsAction}
            />

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Linked Function</h2>
              <FunctionLinkControl
                linkedFunctionId={cateringOrder.functionId}
                linkedFunctionName={cateringOrder.function?.name ?? null}
                linkedFunctionPath={
                  cateringOrder.functionId ? `/events/${eventId}/functions/${cateringOrder.functionId}` : null
                }
                availableFunctions={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
                linkFunction={linkToFunctionAction}
                unlinkFunction={unlinkFromFunctionAction}
              />
            </div>

            <ContactList
              contacts={cateringOrder.contacts}
              addContact={addContactAction}
              updateContact={updateContactAction}
              removeContact={removeContactAction}
              searchContacts={searchContactsAction}
              createContact={createContactAction}
            />

            <WorkflowPanel
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              entityStatus={cateringOrder.status ?? null}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemAction}
            />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <TimelinePreview
              items={cateringOrder.timelineItems}
              serviceTabPath={`${basePath}?tab=service`}
            />
            <MenuSectionTable
              sections={cateringOrder.menuSections}
              responsiblePartyVendors={responsiblePartyVendors}
              createSection={createMenuSectionAction}
              updateSection={updateMenuSectionAction}
              deleteSection={deleteMenuSectionAction}
            />
          </div>
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
              partyVendors={flattenResponsiblePartyOptions(responsiblePartyVendors)}
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

      {activeTab === "vendors" && (
        <VendorPanel
          assignedVendors={cateringOrderVendors}
          eventId={eventId}
          searchEventVendors={searchEventVendorsAction}
          addVendor={addVendorAction}
          updateVendor={updateVendorAction}
          removeVendor={removeVendorAction}
        />
      )}

      {activeTab === "files" && (
        <FileUploadPanel
          entityType="cateringOrder"
          entityId={cateringOrderId}
          files={cateringOrderFiles}
          fileTypeOptions={fileTypeOptions}
          revalidateTarget={`/events/${eventId}/catering-orders/${cateringOrderId}`}
        />
      )}
    </>
  );
}
