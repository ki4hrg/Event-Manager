import { ProgressDots } from "@/components/ProgressStrip";
import type { WorkflowRowSummary } from "@/lib/workflowProgress";

// A list row's workflows: a line of dots per template, with the step in progress.
export function WorkflowBadge({ summary }: { summary: WorkflowRowSummary | undefined }) {
  if (!summary || summary.count === 0) return null;
  const drawn = summary.workflows.filter((w) => w.steps.length > 0);
  if (drawn.length === 0) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
        {summary.count} workflow{summary.count !== 1 ? "s" : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      {drawn.map((w) => (
        <ProgressDots key={w.id} steps={w.steps} title={w.name} />
      ))}
    </span>
  );
}
