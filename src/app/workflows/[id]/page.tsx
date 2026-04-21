import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { requireAdmin } from "@/lib/auth";
import {
  getWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
  createWorkflowStep,
  updateWorkflowStep,
  deleteWorkflowStep,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "../actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { WorkflowEditor } from "./WorkflowEditor";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
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
    <PageWrapper>
      <div className="mb-6">
        <Link
          href="/workflows"
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to Workflows
        </Link>
      </div>

      <WorkflowEditor
        template={template}
        substatuses={substatuses}
        updateTemplate={updateTemplateAction}
        deleteTemplate={deleteTemplateAction}
        createStep={createStepAction}
        updateStep={updateStepAction}
        deleteStep={deleteStepAction}
        createItem={createItemAction}
        updateItem={updateItemAction}
        deleteItem={deleteItemAction}
      />
    </PageWrapper>
  );
}
