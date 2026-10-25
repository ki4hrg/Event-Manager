import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import {
  getWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
  createWorkflowStep,
  updateWorkflowStep,
  previewStepCompletionChange,
  deleteWorkflowStep,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "../actions";
import { getSubstatusOptions } from "@/app/(admin)/settings/actions";
import { WorkflowEditor } from "./WorkflowEditor";
import { LastUpdated } from "@/components/LastUpdated";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const template = await prisma.workflowTemplate.findFirst({
    where: { id, tenantId: (await getActiveTenantId()) ?? "" },
    select: { name: true },
  });
  return { title: template?.name ?? "Workflow" };
}

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PermissionResource.WORKFLOWS, "VIEW");
  const { id } = await params;
  const [template, substatuses] = await Promise.all([
    getWorkflowTemplate(id),
    getSubstatusOptions(),
  ]);

  if (!template) notFound();

  const updateTemplateAction = async (formData: FormData) => {
    "use server";
    await updateWorkflowTemplate(id, formData);
  };

  const deleteTemplateAction = async () => {
    "use server";
    await deleteWorkflowTemplate(id);
  };

  const createStepAction = async (formData: FormData) => {
    "use server";
    await createWorkflowStep(id, formData);
  };

  const updateStepAction = async (stepId: string, formData: FormData) => {
    "use server";
    await updateWorkflowStep(stepId, id, formData);
  };

  const previewStepAction = async (stepId: string, formData: FormData) => {
    "use server";
    return previewStepCompletionChange(stepId, id, formData);
  };

  const deleteStepAction = async (stepId: string) => {
    "use server";
    await deleteWorkflowStep(stepId, id);
  };

  const createItemAction = async (stepId: string, formData: FormData) => {
    "use server";
    await createChecklistItem(stepId, id, formData);
  };

  const updateItemAction = async (itemId: string, formData: FormData) => {
    "use server";
    await updateChecklistItem(itemId, id, formData);
  };

  const deleteItemAction = async (itemId: string) => {
    "use server";
    await deleteChecklistItem(itemId, id);
  };

  return (
    <>
      <div className="mb-6">
        <Link
          href="/workflows"
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to Workflows
        </Link>
        <div className="mt-2">
          <LastUpdated updatedAt={template.updatedAt} updatedBy={template.updatedBy} />
        </div>
      </div>

      <WorkflowEditor
        template={template}
        substatuses={substatuses}
        updateTemplate={updateTemplateAction}
        deleteTemplate={deleteTemplateAction}
        createStep={createStepAction}
        updateStep={updateStepAction}
        previewStep={previewStepAction}
        deleteStep={deleteStepAction}
        createItem={createItemAction}
        updateItem={updateItemAction}
        deleteItem={deleteItemAction}
      />
    </>
  );
}
