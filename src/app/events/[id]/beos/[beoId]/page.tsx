import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { CustomOption } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getBEO,
  updateBEOOverview,
  updateBEOService,
  updateBEOContract,
  deleteBEO,
  linkBEOToFunction,
  unlinkBEOFromFunction,
  createTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
  createBEOLineItem,
  updateBEOLineItem,
  deleteBEOLineItem,
  createBEOMenuSection,
  updateBEOMenuSection,
  deleteBEOMenuSection,
  addBEOContact,
  updateBEOContact,
  removeBEOContact,
  searchContactsForBEO,
} from "../../../beos/actions";
import { getOptions, getEquipment } from "../../../../settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import {
  getBEOVendors,
  addVendorToBEO,
  updateBEOVendor,
  removeVendorFromBEO,
  searchAssignedEventVendors,
} from "@/app/vendors/actions";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { BEOTabs } from "../../../beos/BEOTabs";
import { BEOOverviewForm } from "../../../beos/BEOOverviewForm";
import { BEOServiceForm } from "../../../beos/BEOServiceForm";
import { BEOContractForm } from "../../../beos/BEOContractForm";
import { TimelineTable } from "../../../beos/TimelineTable";
import { EquipmentTable } from "../../../beos/EquipmentTable";
import { LineItemTable } from "../../../beos/LineItemTable";
import { MenuSectionTable } from "../../../beos/MenuSectionTable";
import { ContactList } from "../../../functions/ContactList";
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

export default async function BEOPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; beoId: string }>;
  searchParams: Promise<{ tab?: string; success?: string }>;
}) {
  const { id: eventId, beoId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = ["overview", "service", "contract"].includes(tab) ? tab : "overview";

  const [event, beo, serviceStyleOptions, responsiblePartyOptions, equipmentOptions, equipmentCategories, allAvailableFunctions, workflowInstances, allTemplates] =
    await Promise.all([
      getEvent(eventId),
      getBEO(beoId),
      getOptions("service_style"),
      getOptions("responsible_party"),
      getEquipment(),
      getOptions("equipment_category"),
      prisma.function.findMany({ where: { eventId, beo: null }, orderBy: { name: "asc" } }),
      getWorkflowInstances("beo", beoId),
      getWorkflowTemplateOptions(),
    ]);
  if (!event || !beo) {
    notFound();
  }

  const [beoVendors, vendorTypeOptions]: [Awaited<ReturnType<typeof getBEOVendors>>, CustomOption[]] = await Promise.all([
    getBEOVendors(beoId),
    getOptions("vendor_type"),
  ]);

  const availableFunctions = beo.functionId ? [] : allAvailableFunctions;
  const basePath = `/events/${eventId}/beos/${beoId}`;
  const vendorTypeLabels = Object.fromEntries(vendorTypeOptions.map((t) => [t.value, t.label]));

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const deleteBEOAction = async () => {
    "use server";
    await deleteBEO(beoId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkBEOToFunction(beoId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async () => {
    "use server";
    await unlinkBEOFromFunction(beoId, eventId);
  };

  const updateOverviewAction = async (formData: FormData) => {
    "use server";
    await updateBEOOverview(beoId, eventId, formData);
  };

  const updateServiceAction = async (formData: FormData) => {
    "use server";
    await updateBEOService(beoId, eventId, formData);
  };

  const updateContractAction = async (formData: FormData) => {
    "use server";
    await updateBEOContract(beoId, eventId, formData);
  };

  const createTimelineAction = async (formData: FormData) => {
    "use server";
    await createTimelineItem(beoId, eventId, formData);
  };
  const updateTimelineAction = async (id: string, formData: FormData) => {
    "use server";
    await updateTimelineItem(id, beoId, eventId, formData);
  };
  const deleteTimelineAction = async (id: string) => {
    "use server";
    await deleteTimelineItem(id, beoId, eventId);
  };

  const createEquipmentAction = async (formData: FormData) => {
    "use server";
    await createEquipmentItem(beoId, eventId, formData);
  };
  const updateEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateEquipmentItem(id, beoId, eventId, formData);
  };
  const deleteEquipmentAction = async (id: string) => {
    "use server";
    await deleteEquipmentItem(id, beoId, eventId);
  };

  const createLineItemAction = async (formData: FormData) => {
    "use server";
    await createBEOLineItem(beoId, eventId, formData);
  };
  const updateLineItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateBEOLineItem(id, beoId, eventId, formData);
  };
  const deleteLineItemAction = async (id: string) => {
    "use server";
    await deleteBEOLineItem(id, beoId, eventId);
  };

  const createMenuSectionAction = async (formData: FormData) => {
    "use server";
    await createBEOMenuSection(beoId, eventId, formData);
  };
  const updateMenuSectionAction = async (id: string, formData: FormData) => {
    "use server";
    await updateBEOMenuSection(id, beoId, eventId, formData);
  };
  const deleteMenuSectionAction = async (id: string) => {
    "use server";
    await deleteBEOMenuSection(id, beoId, eventId);
  };

  const addContactAction = async (formData: FormData) => {
    "use server";
    await addBEOContact(beoId, eventId, formData);
  };
  const updateContactAction = async (id: string, formData: FormData) => {
    "use server";
    await updateBEOContact(id, beoId, eventId, formData);
  };
  const removeContactAction = async (id: string) => {
    "use server";
    await removeBEOContact(id, beoId, eventId);
  };
  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContactsForBEO(query);
  };

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "beo", beoId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "beo", beoId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "beo", beoId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "beo", beoId, eventId);
  };

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId);
  };

  const addVendorAction = async (vendorId: string, notes: string) => {
    "use server";
    await addVendorToBEO(beoId, vendorId, eventId, notes);
  };

  const updateVendorAction = async (id: string, notes: string) => {
    "use server";
    await updateBEOVendor(id, beoId, eventId, notes);
  };

  const removeVendorAction = async (id: string) => {
    "use server";
    await removeVendorFromBEO(id, beoId, eventId);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>

      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href={`/events/${eventId}/beos`}
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            &larr; Back to BEOs
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {beo.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteBEOAction}
          confirmMessage="Are you sure you want to delete this BEO?"
        />
      </div>

      <BEOTabs basePath={basePath} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <BEOOverviewForm
              beo={beo}
              action={updateOverviewAction}
              serviceStyleOptions={serviceStyleOptions}
              linkedFunctionId={beo.functionId}
              linkedFunctionName={beo.function?.name ?? null}
              linkedFunctionPath={
                beo.functionId ? `/events/${eventId}/functions/${beo.functionId}` : null
              }
              availableFunctions={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
              linkFunction={linkToFunctionAction}
              unlinkFunction={unlinkFromFunctionAction}
            />
            <VendorPanel
              assignedVendors={beoVendors}
              eventId={eventId}
              searchEventVendors={searchEventVendorsAction}
              addVendor={addVendorAction}
              updateVendor={updateVendorAction}
              removeVendor={removeVendorAction}
              vendorTypeLabels={vendorTypeLabels}
            />
            <ContactList
              contacts={beo.contacts}
              addContact={addContactAction}
              updateContact={updateContactAction}
              removeContact={removeContactAction}
              searchContacts={searchContactsAction}
            />
          </div>
          <div className="space-y-6">
            <WorkflowPanel
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemAction}
            />
            <TimelinePreview
              items={beo.timelineItems}
              serviceTabPath={`${basePath}?tab=service`}
            />
            <MenuSectionTable
              sections={beo.menuSections}
              responsiblePartyOptions={responsiblePartyOptions}
              createSection={createMenuSectionAction}
              updateSection={updateMenuSectionAction}
              deleteSection={deleteMenuSectionAction}
            />
          </div>
        </div>
      )}

      {activeTab === "service" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <BEOServiceForm beo={beo} action={updateServiceAction} />
          <div className="space-y-6">
            <TimelineTable
              items={beo.timelineItems}
              createItem={createTimelineAction}
              updateItem={updateTimelineAction}
              deleteItem={deleteTimelineAction}
            />
            <EquipmentTable
              items={beo.equipmentItems}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <BEOContractForm beo={beo} action={updateContractAction} />
          <LineItemTable
            items={beo.lineItems}
            createItem={createLineItemAction}
            updateItem={updateLineItemAction}
            deleteItem={deleteLineItemAction}
          />
        </div>
      )}
    </PageWrapper>
  );
}
