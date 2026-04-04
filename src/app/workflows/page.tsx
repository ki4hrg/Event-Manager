import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { requireAdmin } from "@/lib/auth";
import { getWorkflowTemplates, createWorkflowTemplate } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  await requireAdmin();
  const templates = await getWorkflowTemplates();

  const createAction = async (formData: FormData) => {
    "use server";
    await createWorkflowTemplate(formData);
  };

  return (
    <PageWrapper>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Workflows</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Define reusable workflow templates with sequential steps and checklist items
          </p>
        </div>
        <form action={createAction}>
          <input
            type="text"
            name="name"
            placeholder="New workflow name"
            required
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm mr-2"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Create
          </button>
        </form>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No workflow templates yet.</p>
        </div>
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
