import type { Metadata } from "next";
import Link from "next/link";
import { PermissionResource } from "@prisma/client";
import { PageWrapper } from "@/components/PageWrapper";
import { requirePermission } from "@/lib/permissions";
import { createWorkflowTemplate } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New workflow" };

export default async function NewWorkflowPage() {
  await requirePermission(PermissionResource.WORKFLOWS, "WRITE");

  const createAction = async (formData: FormData) => {
    "use server";
    await createWorkflowTemplate(formData);
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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Workflow
        </h1>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 max-w-lg">
        <form action={createAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              name="name"
              required
              autoFocus
              placeholder="e.g., Special Meal Workflow"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <textarea
              name="description"
              rows={2}
              placeholder="What is this workflow for?"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Workflow
            </button>
            <Link
              href="/workflows"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </PageWrapper>
  );
}
