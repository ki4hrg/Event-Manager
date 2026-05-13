import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CancelOrDeleteButton } from "@/components/CancelOrDeleteButton";
import { Toast } from "@/components/Toast";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EntityStatusPanel } from "@/components/EntityStatusPanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { VendorPanel } from "../../../vendors/VendorPanel";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getEvent } from "../../../actions";
import {
  getPrintOrder,
  updatePrintOrder,
  deletePrintOrder,
  linkPrintOrderToFunction,
  unlinkPrintOrderFromFunction,
  linkPrintOrderToPresentation,
  unlinkPrintOrderFromPresentation,
  createPrintItem,
  updatePrintItem,
  deletePrintItem,
  getPrintOrderPartyOptions,
} from "../../../print-orders/actions";
import {
  getPrintOrderVendors,
  addVendorToPrintOrder,
  updatePrintOrderVendor,
  removeVendorFromPrintOrder,
  searchAssignedEventVendors,
  getResponsiblePartyVendors,
} from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";
import { getWorkflowInstances, assignWorkflow, removeWorkflow, toggleStepCompletion, toggleItemCompletion, setEntityStatus, cancelEntity, restoreEntity } from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { PrintOrderTabs, PRINT_ORDER_TABS } from "../../../print-orders/PrintOrderTabs";
import { PrintOrderForm } from "../../../print-orders/PrintOrderForm";
import { PrintItemPanel } from "../../../print-orders/PrintItemPanel";
import { PrintOrderLinkPanel } from "../../../print-orders/PrintOrderLinkPanel";

export const dynamic = "force-dynamic";

export default async function PrintOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; printOrderId: string }>;
  searchParams: Promise<{ tab?: string; success?: string }>;
}) {
  const { id: eventId, printOrderId } = await params;
  const { tab = "overview" } = await searchParams;
  const activeTab = PRINT_ORDER_TABS.some((t) => t.value === tab) ? tab : "overview";

  const [event, printOrder, workflowInstances, allTemplates] = await Promise.all([
    getEvent(eventId),
    getPrintOrder(printOrderId),
    getWorkflowInstances("print_order", printOrderId),
    getWorkflowTemplateOptions(),
  ]);

  if (!event || !printOrder) notFound();

  const [
    printOrderVendors, fileTypeOptions, printOrderFiles, responsiblePartyVendors, substatuses,
    distributionOptions, availableFunctions, availablePresentations, partyOptions,
  ] = await Promise.all([
    getPrintOrderVendors(printOrderId),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { printOrderId }, orderBy: { createdAt: "asc" } }),
    getResponsiblePartyVendors(eventId, "PRINT_ORDER"),
    getSubstatusOptions(),
    getOptions("print_distribution"),
    prisma.function.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
    printOrder.presentationId
      ? Promise.resolve([])
      : prisma.presentation.findMany({
          where: { eventId, printOrder: { is: null } },
          select: { id: true, title: true },
          orderBy: { title: "asc" },
        }),
    getPrintOrderPartyOptions(printOrderId),
  ]);

  const linkedFunctionIds = new Set(printOrder.functions.map((f) => f.function.id));
  const unlinkableFunctions = availableFunctions.filter((f) => !linkedFunctionIds.has(f.id));

  // Server action closures
  const updatePrintOrderAction = async (formData: FormData) => {
    "use server";
    await updatePrintOrder(printOrderId, eventId, formData);
  };

  const deletePrintOrderAction = async () => {
    "use server";
    await deletePrintOrder(printOrderId, eventId);
  };

  const addVendorToFormAction = async (vendorId: string) => {
    "use server";
    await addVendorToPrintOrder(printOrderId, vendorId, eventId);
  };

  const removeVendorFromFormAction = async (junctionId: string) => {
    "use server";
    await removeVendorFromPrintOrder(junctionId, printOrderId, eventId);
  };

  const searchEventVendorsAction = async (query: string) => {
    "use server";
    return searchAssignedEventVendors(query, eventId, "PRINT_ORDER");
  };

  const addVendorAction = async (vendorId: string, notes: string) => {
    "use server";
    await addVendorToPrintOrder(printOrderId, vendorId, eventId, notes);
  };

  const updateVendorAction = async (id: string, notes: string) => {
    "use server";
    await updatePrintOrderVendor(id, printOrderId, eventId, notes);
  };

  const removeVendorAction = async (id: string) => {
    "use server";
    await removeVendorFromPrintOrder(id, printOrderId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkPrintOrderToFunction(printOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async (functionId: string) => {
    "use server";
    await unlinkPrintOrderFromFunction(printOrderId, functionId, eventId);
  };

  const linkToPresentationAction = async (presentationId: string) => {
    "use server";
    await linkPrintOrderToPresentation(printOrderId, presentationId, eventId);
  };

  const unlinkFromPresentationAction = async () => {
    "use server";
    await unlinkPrintOrderFromPresentation(printOrderId, printOrder.presentationId, eventId);
  };

  const createItemAction = async (formData: FormData) => {
    "use server";
    await createPrintItem(printOrderId, eventId, formData);
  };

  const updateItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updatePrintItem(id, printOrderId, eventId, formData);
  };

  const deleteItemAction = async (id: string) => {
    "use server";
    await deletePrintItem(id, printOrderId, eventId);
  };

  const flatVendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "print_order", printOrderId, eventId);
  };

  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "print_order", printOrderId, eventId);
  };

  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "print_order", printOrderId, eventId);
  };

  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "print_order", printOrderId, eventId);
  };

  const setStatusAction = async (formData: FormData) => {
    "use server";
    await setEntityStatus("print_order", printOrderId, eventId, formData);
  };

  const cancelAction = async (substatus: string) => {
    "use server";
    await cancelEntity("print_order", printOrderId, substatus, eventId);
  };

  const restoreAction = async () => {
    "use server";
    await restoreEntity("print_order", printOrderId, eventId);
  };

  const entityStatus = printOrder.status ?? null;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>

      <div className="flex justify-between items-center mb-6">
        <div>
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Print Orders", href: `/events/${eventId}/print-orders` },
              { label: printOrder.name },
            ]}
          />
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {printOrder.name}
            </h1>
            <EntityStatusBadge status={entityStatus} substatus={printOrder.substatus ?? null} />
            <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
          </div>
        </div>
        <CancelOrDeleteButton
          status={printOrder.status ?? null}
          substatuses={substatuses}
          cancel={cancelAction}
          restore={restoreAction}
          deleteAction={deletePrintOrderAction}
          confirmMessage="Are you sure you want to delete this Print Order?"
        />
      </div>

      <PrintOrderTabs basePath={`/events/${eventId}/print-orders/${printOrderId}`} activeTab={activeTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4">
                <EntityStatusPanel
                  standalone={false}
                  entityType="print_order"
                  entityId={printOrderId}
                  eventId={eventId}
                  status={printOrder.status ?? null}
                  substatus={printOrder.substatus ?? null}
                  substatuses={substatuses}
                  setStatus={setStatusAction}
                />
              </div>
              <PrintOrderForm
                noCard
                printOrder={printOrder}
                eventId={eventId}
                action={updatePrintOrderAction}
                vendorLink={{
                  assignedVendors: printOrderVendors,
                  availableVendors: flatVendors.map((v) => ({ id: v.id, label: v.name })),
                  addVendor: addVendorToFormAction,
                  removeVendor: removeVendorFromFormAction,
                }}
              />
            </div>

            <PrintOrderLinkPanel
              eventId={eventId}
              linkedFunctions={printOrder.functions.map((f) => ({
                id: f.function.id,
                name: f.function.name,
                path: `/events/${eventId}/functions/${f.function.id}`,
              }))}
              availableFunctions={unlinkableFunctions.map((f) => ({ id: f.id, label: f.name }))}
              linkFunction={linkToFunctionAction}
              unlinkFunction={unlinkFromFunctionAction}
              linkedPresentation={
                printOrder.presentation
                  ? {
                      id: printOrder.presentation.id,
                      title: printOrder.presentation.title,
                      path: `/events/${eventId}/presentations/${printOrder.presentation.id}`,
                    }
                  : null
              }
              availablePresentations={availablePresentations.map((p) => ({ id: p.id, label: p.title }))}
              linkPresentation={linkToPresentationAction}
              unlinkPresentation={unlinkFromPresentationAction}
            />

            <WorkflowPanel
              instances={workflowInstances}
              availableTemplates={availableWorkflowTemplates}
              entityStatus={printOrder.status ?? null}
              assignWorkflow={assignWorkflowAction}
              removeWorkflow={removeWorkflowAction}
              toggleStep={toggleStepAction}
              toggleItem={toggleItemAction}
            />
          </div>

          <div className="lg:col-span-2">
            <PrintItemPanel
              items={printOrder.items}
              distributionOptions={distributionOptions}
              vendors={flatVendors}
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
          assignedVendors={printOrderVendors}
          eventId={eventId}
          searchEventVendors={searchEventVendorsAction}
          addVendor={addVendorAction}
          updateVendor={updateVendorAction}
          removeVendor={removeVendorAction}
        />
      )}

      {activeTab === "files" && (
        <FileUploadPanel
          entityType="printOrder"
          entityId={printOrderId}
          files={printOrderFiles}
          fileTypeOptions={fileTypeOptions}
          revalidateTarget={`/events/${eventId}/print-orders/${printOrderId}`}
        />
      )}
    </>
  );

}
