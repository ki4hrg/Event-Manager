"use client";

import { useState } from "react";
import type {
  WorkflowInstance as PrismaWorkflowInstance,
  WorkflowTemplate,
  WorkflowStep,
  WorkflowChecklistItem,
  WorkflowStepCompletion,
  WorkflowChecklistCompletion,
} from "@prisma/client";

type StepWithItems = WorkflowStep & {
  items: WorkflowChecklistItem[];
};

type TemplateWithSteps = WorkflowTemplate & {
  steps: StepWithItems[];
};

type InstanceWithData = PrismaWorkflowInstance & {
  template: TemplateWithSteps;
  stepCompletions: WorkflowStepCompletion[];
  itemCompletions: WorkflowChecklistCompletion[];
};

type AvailableTemplate = { id: string; name: string };

type WorkflowPanelProps = {
  instances: InstanceWithData[];
  availableTemplates: AvailableTemplate[];
  assignWorkflow: (templateId: string) => Promise<void>;
  removeWorkflow: (instanceId: string) => Promise<void>;
  toggleStep: (instanceId: string, stepId: string) => Promise<void>;
  toggleItem: (instanceId: string, itemId: string) => Promise<void>;
};

function CheckIcon({ size = "md" }: { size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  return (
    <svg className={`${cls} text-white`} viewBox="0 0 10 8" fill="none">
      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function computeProgress(
  steps: StepWithItems[],
  completedStepIds: Set<string>,
  completedItemIds: Set<string>
) {
  let total = 0;
  let done = 0;
  for (const step of steps) {
    if (step.items.length === 0) {
      total += 1;
      if (completedStepIds.has(step.id)) done += 1;
    } else {
      for (const item of step.items) {
        total += 1;
        if (completedItemIds.has(item.id)) done += 1;
      }
    }
  }
  return { total, done };
}

function isStepComplete(
  step: StepWithItems,
  completedStepIds: Set<string>,
  completedItemIds: Set<string>
): boolean {
  if (step.items.length === 0) return completedStepIds.has(step.id);
  return step.items.every((item) => completedItemIds.has(item.id));
}

function WorkflowInstancePanel({
  instance,
  removeWorkflow,
  toggleStep,
  toggleItem,
}: {
  instance: InstanceWithData;
  removeWorkflow: (instanceId: string) => Promise<void>;
  toggleStep: (instanceId: string, stepId: string) => Promise<void>;
  toggleItem: (instanceId: string, itemId: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const completedStepIds = new Set(instance.stepCompletions.map((c) => c.stepId));
  const completedItemIds = new Set(instance.itemCompletions.map((c) => c.itemId));
  const { total, done } = computeProgress(instance.template.steps, completedStepIds, completedItemIds);
  const allDone = total > 0 && done === total;

  const handleToggleStep = async (stepId: string) => {
    setPending(`step:${stepId}`);
    await toggleStep(instance.id, stepId);
    setPending(null);
  };

  const handleToggleItem = async (itemId: string) => {
    setPending(`item:${itemId}`);
    await toggleItem(instance.id, itemId);
    setPending(null);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-900 dark:text-white text-sm">
            {instance.template.name}
          </span>
          {total > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                allDone
                  ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              }`}
            >
              {done}/{total}
            </span>
          )}
        </div>
        <button
          onClick={async () => {
            if (confirm(`Remove workflow "${instance.template.name}" from this item?`)) {
              await removeWorkflow(instance.id);
            }
          }}
          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-xs"
        >
          Remove
        </button>
      </div>

      {instance.template.steps.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {instance.template.steps.map((step, index) => {
            const stepDone = isStepComplete(step, completedStepIds, completedItemIds);
            const isChecklistStep = step.items.length > 0;
            const stepPending = pending === `step:${step.id}`;

            return (
              <div key={step.id}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-5 shrink-0 text-right">
                    {index + 1}
                  </span>
                  {isChecklistStep ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          stepDone
                            ? "border-green-500 bg-green-500"
                            : "border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        {stepDone && <CheckIcon />}
                      </span>
                      <span
                        className={`text-sm ${
                          stepDone
                            ? "text-gray-400 dark:text-gray-500 line-through"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() => handleToggleStep(step.id)}
                      disabled={stepPending}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          stepDone
                            ? "border-green-500 bg-green-500"
                            : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                        } ${stepPending ? "opacity-50" : ""}`}
                      >
                        {stepDone && <CheckIcon />}
                      </span>
                      <span
                        className={`text-sm ${
                          stepDone
                            ? "text-gray-400 dark:text-gray-500 line-through"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {step.label}
                      </span>
                    </button>
                  )}
                  {isChecklistStep && !stepDone && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {step.items.filter((i) => completedItemIds.has(i.id)).length}/{step.items.length}
                    </span>
                  )}
                </div>

                {isChecklistStep && (
                  <div className="pb-1">
                    {step.items.map((item) => {
                      const itemDone = completedItemIds.has(item.id);
                      const itemPending = pending === `item:${item.id}`;
                      return (
                        <button
                          key={item.id}
                          className="flex items-center gap-2 w-full text-left px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          onClick={() => handleToggleItem(item.id)}
                          disabled={itemPending}
                        >
                          <span className="w-5 shrink-0" />
                          <span
                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              itemDone
                                ? "border-green-500 bg-green-500"
                                : "border-gray-300 dark:border-gray-600"
                            } ${itemPending ? "opacity-50" : ""}`}
                          >
                            {itemDone && <CheckIcon size="sm" />}
                          </span>
                          <span
                            className={`text-xs ${
                              itemDone
                                ? "text-gray-400 dark:text-gray-500 line-through"
                                : "text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkflowPanel({
  instances,
  availableTemplates,
  assignWorkflow,
  removeWorkflow,
  toggleStep,
  toggleItem,
}: WorkflowPanelProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const handleAssign = async () => {
    if (!selectedTemplateId) return;
    setAssigning(true);
    await assignWorkflow(selectedTemplateId);
    setSelectedTemplateId("");
    setAssigning(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Workflows</h2>

      <div className="space-y-3">
        {instances.map((instance) => (
          <WorkflowInstancePanel
            key={instance.id}
            instance={instance}
            removeWorkflow={removeWorkflow}
            toggleStep={toggleStep}
            toggleItem={toggleItem}
          />
        ))}

        {availableTemplates.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="">Assign workflow...</option>
              {availableTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={!selectedTemplateId || assigning}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {assigning ? "..." : "Assign"}
            </button>
          </div>
        )}

        {instances.length === 0 && availableTemplates.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No workflows available. Create templates in the Workflows section.
          </p>
        )}

        {instances.length === 0 && availableTemplates.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 pb-1">
            No workflows assigned yet.
          </p>
        )}
      </div>
    </div>
  );
}
