import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import {
  getAVOrder,
  updateAVOrder,
  deleteAVOrder,
  linkAVOrderToFunction,
  linkAVOrderToPresentation,
  unlinkAVOrderFromFunction,
  unlinkAVOrderFromPresentation,
  getAVOrderPartyOptions,
  updateAudioSection,
  createInputGroup,
  updateInputGroup,
  deleteInputGroup,
  createInputItem,
  updateInputItem,
  deleteInputItem,
  createMonitorMix,
  updateMonitorMix,
  deleteMonitorMix,
  updateVideoSection,
  createVideoEquipmentItem,
  updateVideoEquipmentItem,
  deleteVideoEquipmentItem,
  createAVEquipmentItem,
  updateAVEquipmentItem,
  deleteAVEquipmentItem,
} from "../../../av-orders/actions";
import {
  getAVOrderVendors,
  addVendorToAVOrder,
  updateAVOrderVendor,
  removeVendorFromAVOrder,
  searchAssignedEventVendors,
  getResponsiblePartyVendors,
} from "@/app/vendors/actions";
import { getOptions, getEquipment, getSubstatusOptions } from "@/app/settings/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { AVOrderForm } from "../../../av-orders/AVOrderForm";
import { AVOrderLinkPanel } from "../../../av-orders/AVOrderLinkPanel";
import { AVOrderFunctionList } from "../../../av-orders/AVOrderFunctionList";
import { AVOrderTabs, AV_ORDER_TABS } from "../../../av-orders/AVOrderTabs";
import { AudioSectionPanel } from "../../../av-orders/AudioSectionPanel";
import { VideoSectionPanel } from "../../../av-orders/VideoSectionPanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { EquipmentTable } from "../../../catering-orders/EquipmentTable";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";

export const dynamic = "force-dynamic";

export default async function AVOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; avOrderId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: eventId, avOrderId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = AV_ORDER_TABS.some((t) => t.value === tab) ? tab : "overview";

  const [event, avOrder, workflowInstances, allTemplates] = await Promise.all([
    getEvent(eventId),
    getAVOrder(avOrderId),
    getWorkflowInstances("av_order", avOrderId),
    getWorkflowTemplateOptions(),
  ]);

  if (!event || !avOrder) {
    notFound();
  }

  const [avOrderVendors, fileTypeOptions, avOrderFiles, availableEventVendors, substatuses] = await Promise.all([
    getAVOrderVendors(avOrderId),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { avOrderId }, orderBy: { createdAt: "asc" } }),
    searchAssignedEventVendors("", eventId, "AV_ORDER"),
    getSubstatusOptions(),
  ]);

  // Fetch tab-specific data
  let availableFunctions: Awaited<ReturnType<typeof prisma.function.findMany>> = [];
  let availablePresentations: Awaited<ReturnType<typeof prisma.presentation.findMany>> = [];
  let equipmentOptions: Awaited<ReturnType<typeof getEquipment>> = [];
  let equipmentCategories: Awaited<ReturnType<typeof getOptions>> = [];
  let responsiblePartyVendors: Awaited<ReturnType<typeof getResponsiblePartyVendors>> = { vendors: [], venueVendor: null, systemVendor: null };
  let overviewPartyOptions: Awaited<ReturnType<typeof getAVOrderPartyOptions>> = { vendors: [], contacts: [] };
  if (activeTab === "overview") {
    [availableFunctions, availablePresentations, equipmentOptions, equipmentCategories, responsiblePartyVendors, overviewPartyOptions] = await Promise.all([
      prisma.function.findMany({ where: { eventId, avOrderId: null }, orderBy: { name: "asc" } }),
      avOrder.presentationId
        ? []
        : prisma.presentation.findMany({ where: { eventId, avOrder: null }, orderBy: { title: "asc" } }),
      getEquipment(),
      getOptions("equipment_category"),
      getResponsiblePartyVendors(eventId, "AV_ORDER"),
      getAVOrderPartyOptions(avOrderId, eventId),
    ]);
  }

  const avEquipmentCategoryLabels = new Set(
    equipmentCategories.filter((c) => c.models.includes("AV_ORDER")).map((c) => c.label)
  );
  const hasAvEquipmentFilter = avEquipmentCategoryLabels.size > 0;
  const filteredEquipmentOptions = hasAvEquipmentFilter
    ? equipmentOptions.filter((e) => avEquipmentCategoryLabels.has(e.category))
    : equipmentOptions;

  let partyOptions: Awaited<ReturnType<typeof getAVOrderPartyOptions>> = { vendors: [], contacts: [] };
  let tabResponsiblePartyVendors: Awaited<ReturnType<typeof getResponsiblePartyVendors>> = { vendors: [], venueVendor: null, systemVendor: null };
  let audioEquipmentItems: Awaited<ReturnType<typeof prisma.equipment.findMany>> = [];
  if (activeTab === "audio") {
    const avCategories = await prisma.customOption.findMany({
      where: { category: "equipment_category", models: { has: "AV_ORDER" } },
      select: { label: true },
    });
    const avCategoryLabels = avCategories.map((c) => c.label);
    [partyOptions, tabResponsiblePartyVendors, audioEquipmentItems] = await Promise.all([
      getAVOrderPartyOptions(avOrderId, eventId),
      getResponsiblePartyVendors(eventId, "AV_ORDER"),
      prisma.equipment.findMany({
        where: { category: { in: avCategoryLabels } },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      }),
    ]);
  } else if (activeTab === "video") {
    [partyOptions, tabResponsiblePartyVendors] = await Promise.all([
      getAVOrderPartyOptions(avOrderId, eventId),
      getResponsiblePartyVendors(eventId, "AV_ORDER"),
    ]);
  }

  const audioInputOptions = audioEquipmentItems.filter((e) => e.category === "Audio Inputs");
  const audioOutputOptions = audioEquipmentItems.filter((e) => e.category === "Audio Outputs");

  // ---- Server action closures ----

  const updateAVOrderAction = async (formData: FormData) => {
    "use server";
    await updateAVOrder(avOrderId, eventId, formData);
  };

  const deleteAVOrderAction = async () => {
    "use server";
    await deleteAVOrder(avOrderId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkAVOrderToFunction(avOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async (functionId: string) => {
    "use server";
    await unlinkAVOrderFromFunction(avOrderId, functionId, eventId);
  };

  const linkToPresentationAction = async (presentationId: string) => {
    "use server";
    await linkAVOrderToPresentation(avOrderId, presentationId, eventId);
  };

  const unlinkFromPresentationAction = async () => {
    "use server";
    await unlinkAVOrderFromPresentation(avOrderId, eventId);
  };

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId, "AV_ORDER");
  };

  const addVendorAction = async (vendorId: string, notes: string) => {
    "use server";
    await addVendorToAVOrder(avOrderId, vendorId, eventId, notes);
  };

  const updateVendorAction = async (id: string, notes: string) => {
    "use server";
    await updateAVOrderVendor(id, avOrderId, eventId, notes);
  };

  const removeVendorAction = async (id: string) => {
    "use server";
    await removeVendorFromAVOrder(id, avOrderId, eventId);
  };

  const addVendorToFormAction = async (vendorId: string) => {
    "use server";
    await addVendorToAVOrder(avOrderId, vendorId, eventId);
  };

  const removeVendorFromFormAction = async (junctionId: string) => {
    "use server";
    await removeVendorFromAVOrder(junctionId, avOrderId, eventId);
  };

  const entityStatus = avOrder.status ?? null;

  const readOnlyTotals: Record<string, number> = {};
  for (const group of avOrder.audioSection?.inputGroups ?? []) {
    for (const item of group.inputItems) {
      if (item.equipment) readOnlyTotals[item.equipment.name] = (readOnlyTotals[item.equipment.name] ?? 0) + item.quantity;
    }
  }
  for (const mix of avOrder.audioSection?.monitorMixes ?? []) {
    if (mix.equipment) readOnlyTotals[mix.equipment.name] = (readOnlyTotals[mix.equipment.name] ?? 0) + 1;
  }
  for (const item of avOrder.videoSection?.equipmentItems ?? []) {
    readOnlyTotals[item.item] = (readOnlyTotals[item.item] ?? 0) + (item.quantity ?? 1);
  }
  const readOnlyItems = Object.entries(readOnlyTotals).map(([label, quantity]) => ({ label, quantity }));

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "av_order", avOrderId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "av_order", avOrderId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "av_order", avOrderId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "av_order", avOrderId, eventId);
  };

  // Audio section actions
  const updateAudioSectionAction = async (formData: FormData) => {
    "use server";
    if (!avOrder.audioSection) return;
    await updateAudioSection(avOrder.audioSection.id, avOrderId, eventId, formData);
  };

  const createInputGroupAction = async (formData: FormData) => {
    "use server";
    if (!avOrder.audioSection) return;
    await createInputGroup(avOrder.audioSection.id, avOrderId, eventId, formData);
  };

  const updateInputGroupAction = async (id: string, formData: FormData) => {
    "use server";
    await updateInputGroup(id, avOrderId, eventId, formData);
  };

  const deleteInputGroupAction = async (id: string) => {
    "use server";
    await deleteInputGroup(id, avOrderId, eventId);
  };

  const createInputItemAction = async (inputGroupId: string, formData: FormData) => {
    "use server";
    await createInputItem(inputGroupId, avOrderId, eventId, formData);
  };

  const updateInputItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateInputItem(id, avOrderId, eventId, formData);
  };

  const deleteInputItemAction = async (id: string) => {
    "use server";
    await deleteInputItem(id, avOrderId, eventId);
  };

  const createMonitorMixAction = async (formData: FormData) => {
    "use server";
    if (!avOrder.audioSection) return;
    await createMonitorMix(avOrder.audioSection.id, avOrderId, eventId, formData);
  };

  const updateMonitorMixAction = async (id: string, formData: FormData) => {
    "use server";
    await updateMonitorMix(id, avOrderId, eventId, formData);
  };

  const deleteMonitorMixAction = async (id: string) => {
    "use server";
    await deleteMonitorMix(id, avOrderId, eventId);
  };

  // Video section actions
  const updateVideoSectionAction = async (formData: FormData) => {
    "use server";
    if (!avOrder.videoSection) return;
    await updateVideoSection(avOrder.videoSection.id, avOrderId, eventId, formData);
  };

  const createVideoItemAction = async (formData: FormData) => {
    "use server";
    if (!avOrder.videoSection) return;
    await createVideoEquipmentItem(avOrder.videoSection.id, avOrderId, eventId, formData);
  };

  const updateVideoItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateVideoEquipmentItem(id, avOrderId, eventId, formData);
  };

  const deleteVideoItemAction = async (id: string) => {
    "use server";
    await deleteVideoEquipmentItem(id, avOrderId, eventId);
  };

  const createAVEquipmentAction = async (formData: FormData) => {
    "use server";
    await createAVEquipmentItem(avOrderId, eventId, formData);
  };

  const updateAVEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateAVEquipmentItem(id, avOrderId, eventId, formData);
  };

  const deleteAVEquipmentAction = async (id: string) => {
    "use server";
    await deleteAVEquipmentItem(id, avOrderId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("av_order", avOrderId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("av_order", avOrderId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("av_order", avOrderId, eventId);
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
            { label: "AV Orders", href: `/events/${eventId}/av-orders` },
            { label: avOrder.name },
          ]} />
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {avOrder.name}
            </h1>
            <EntityStatusBadge status={entityStatus} substatus={avOrder.substatus ?? null} />
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/events/${eventId}/av-orders/${avOrderId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print
          </a>
          <CancelOrDeleteButton
            status={avOrder.status ?? null}
            substatuses={substatuses}
            cancel={cancelAction}
            restore={restoreAction}
            deleteAction={deleteAVOrderAction}
            confirmMessage="Are you sure you want to delete this AV Order?"
          />
        </div>
      </div>

      <AVOrderTabs basePath={`/events/${eventId}/av-orders/${avOrderId}`} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
                <EntityStatusPanel
                  standalone={false}
                  entityType="av_order"
                  entityId={avOrderId}
                  eventId={eventId}
                  status={avOrder.status ?? null}
                  substatus={avOrder.substatus ?? null}
                  substatuses={substatuses}
                  setStatus={setStatusAction}
                />
              </div>
              <AVOrderForm
                noCard
                avOrder={avOrder}
                eventId={eventId}
                action={updateAVOrderAction}
                vendorLink={{
                  assignedVendors: avOrderVendors,
                  availableVendors: availableEventVendors.map((v) => ({ id: v.id, label: v.name })),
                  addVendor: addVendorToFormAction,
                  removeVendor: removeVendorFromFormAction,
                }}
              />
            </div>
            <AVOrderFunctionList
              linkedFunctions={avOrder.functions.map((f) => ({
                id: f.id,
                name: f.name,
                detailPath: `/events/${eventId}/functions/${f.id}`,
              }))}
              availableFunctions={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
              linkFunction={linkToFunctionAction}
              unlinkFunction={unlinkFromFunctionAction}
            />
            <AVOrderLinkPanel
              title="Linked Presentation"
              linkedId={avOrder.presentationId}
              linkedName={avOrder.presentation?.title ?? null}
              linkedDetailPath={
                avOrder.presentationId
                  ? `/events/${eventId}/presentations/${avOrder.presentationId}`
                  : null
              }
              availableItems={availablePresentations.map((p) => ({ id: p.id, label: p.title }))}
              newItemPath={`/events/${eventId}/av-orders/new?presentationId=placeholder`}
              linkItem={linkToPresentationAction}
              unlinkItem={unlinkFromPresentationAction}
              entityLabel="presentation"
            />
            <WorkflowPanel
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              entityStatus={avOrder.status ?? null}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemAction}
            />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <EquipmentTable
              items={avOrder.equipmentItems}
              partyVendors={flattenResponsiblePartyOptions(responsiblePartyVendors)}
              contactOptions={overviewPartyOptions.contacts}
              contactsLabel="Presenters"
              equipmentOptions={filteredEquipmentOptions}
              allEquipmentOptions={hasAvEquipmentFilter ? equipmentOptions : undefined}
              equipmentCategories={equipmentCategories}
              createItem={createAVEquipmentAction}
              updateItem={updateAVEquipmentAction}
              deleteItem={deleteAVEquipmentAction}
              readOnlyItems={readOnlyItems}
            />
          </div>
        </div>
      )}

      {activeTab === "audio" && avOrder.audioSection && (
        <AudioSectionPanel
          audioSection={avOrder.audioSection}
          audioInputOptions={audioInputOptions}
          audioOutputOptions={audioOutputOptions}
          vendorOptions={flattenResponsiblePartyOptions(tabResponsiblePartyVendors)}
          contactOptions={partyOptions.contacts}
          updateSection={updateAudioSectionAction}
          createInputGroup={createInputGroupAction}
          updateInputGroup={updateInputGroupAction}
          deleteInputGroup={deleteInputGroupAction}
          createInputItem={createInputItemAction}
          updateInputItem={updateInputItemAction}
          deleteInputItem={deleteInputItemAction}
          createMonitorMix={createMonitorMixAction}
          updateMonitorMix={updateMonitorMixAction}
          deleteMonitorMix={deleteMonitorMixAction}
        />
      )}

      {activeTab === "video" && avOrder.videoSection && (
        <VideoSectionPanel
          videoSection={avOrder.videoSection}
          vendorOptions={flattenResponsiblePartyOptions(tabResponsiblePartyVendors)}
          contactOptions={partyOptions.contacts}
          updateSection={updateVideoSectionAction}
          createItem={createVideoItemAction}
          updateItem={updateVideoItemAction}
          deleteItem={deleteVideoItemAction}
        />
      )}

      {activeTab === "vendors" && (
        <VendorPanel
          assignedVendors={avOrderVendors}
          eventId={eventId}
          searchEventVendors={searchEventVendorsAction}
          addVendor={addVendorAction}
          updateVendor={updateVendorAction}
          removeVendor={removeVendorAction}
        />
      )}

      {activeTab === "files" && (
        <FileUploadPanel
          entityType="avOrder"
          entityId={avOrderId}
          files={avOrderFiles}
          fileTypeOptions={fileTypeOptions}
          revalidateTarget={`/events/${eventId}/av-orders/${avOrderId}`}
        />
      )}
    </PageWrapper>
  );
}
