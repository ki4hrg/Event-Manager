import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PermissionResource } from "@prisma/client";
import { btnPrimary } from "@/lib/buttonStyles";
import { requirePermission } from "@/lib/permissions";
import { getWorkflowTemplates } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  await requirePermission(PermissionResource.WORKFLOWS, "VIEW");
  const templates = await getWorkflowTemplates();

  return (
    <PageWrapper>
      <PageHeader
        title="Workflows"
        description="Define reusable workflow templates with sequential steps and checklist items"
        actions={
          <Link href="/workflows/new" className={btnPrimary}>
            Create Workflow
          </Link>
        }
      />

      {templates.length === 0 ? (
        <EmptyState message="No workflow templates yet." />
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/workflows/${template.id}`}
              className="block bg-white dark:bg-gray-800 shadow rounded-lg p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-medium text-gray-900 dark:text-white">{template.name}</h2>
                  {template.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {template.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>{template.steps.length} step{template.steps.length !== 1 ? "s" : ""}</span>
                    {template._count.instances > 0 && (
                      <span>{template._count.instances} assignment{template._count.instances !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <span className="text-blue-600 dark:text-blue-400 text-sm">Edit &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
