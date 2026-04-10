import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";

type WorkflowInstanceForBadge = {
  stepCompletions: { stepId: string }[];
  itemCompletions: { itemId: string }[];
  template: {
    steps: {
      id: string;
      items: { id: string }[];
    }[];
  };
};

export function computeWorkflowBadgeSummary(
  instances: WorkflowInstanceForBadge[]
): WorkflowBadgeSummary | null {
  if (instances.length === 0) return null;

  let done = 0;
  let total = 0;

  for (const instance of instances) {
    const completedStepIds = new Set(instance.stepCompletions.map((c) => c.stepId));
    const completedItemIds = new Set(instance.itemCompletions.map((c) => c.itemId));
    for (const step of instance.template.steps) {
      if (step.items.length === 0) {
        total++;
        if (completedStepIds.has(step.id)) done++;
      } else {
        for (const item of step.items) {
          total++;
          if (completedItemIds.has(item.id)) done++;
        }
      }
    }
  }

  return { count: instances.length, done, total };
}

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
