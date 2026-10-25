import type { WorkflowBadgeSummary } from "@/lib/workflowProgress";

type Props = {
  summary: WorkflowBadgeSummary | null;
};

export function WorkflowStatusBadge({ summary }: Props) {
  if (!summary || summary.count === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
        No workflow
      </span>
    );
  }

  if (summary.done === summary.total) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Done
      </span>
    );
  }

  if (summary.done === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
        Not started
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      {summary.done}/{summary.total}
    </span>
  );
}
