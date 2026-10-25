import type { WorkflowBadgeSummary } from "@/lib/workflowProgress";

export function WorkflowBadge({ summary }: { summary: WorkflowBadgeSummary | undefined }) {
  if (!summary || summary.count === 0) return null;

  if (summary.total === 0) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
        {summary.count} workflow{summary.count !== 1 ? "s" : ""}
      </span>
    );
  }

  const allDone = summary.done === summary.total;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${
        allDone
          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
      }`}
    >
      {allDone ? "Done" : `${summary.done}/${summary.total}`}
    </span>
  );
}
