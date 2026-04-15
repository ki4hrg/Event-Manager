import type { getWorkflowInstances } from "@/app/events/workflows/actions";
import { Section } from "./PrintDetails";

type WorkflowInstance = Awaited<ReturnType<typeof getWorkflowInstances>>[number];

export function WorkflowSection({ workflowInstances }: { workflowInstances: WorkflowInstance[] }) {
  if (workflowInstances.length === 0) return null;
  return (
    <Section title="Workflow">
      {workflowInstances.map((instance) => {
        const completedStepIds = new Set(instance.stepCompletions.map((c) => c.stepId));
        const completedItemIds = new Set(instance.itemCompletions.map((c) => c.itemId));
        return (
          <div key={instance.id} className="mb-4">
            <p className="text-sm font-medium text-gray-700 print:text-black mb-1">
              {instance.template.name}
            </p>
            {instance.template.steps.map((step) => (
              <div key={step.id} className="ml-3 mb-1">
                <p className="text-sm text-gray-600 print:text-gray-700">
                  {completedStepIds.has(step.id) ? "☑" : "☐"} {step.label}
                </p>
                {step.items.map((item) => (
                  <p key={item.id} className="text-xs text-gray-500 print:text-gray-600 ml-4">
                    {completedItemIds.has(item.id) ? "☑" : "☐"} {item.label}
                  </p>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </Section>
  );
}
