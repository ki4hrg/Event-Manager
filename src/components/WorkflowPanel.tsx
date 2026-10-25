"use client";

import Link from "next/link";
import { useState } from "react";
import { ENTITY_TYPE_RESOURCE, type WorkflowEntityType } from "@/app/events/workflows/entity-types";
import { useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";
import { instanceProgress } from "@/lib/workflowProgress";
import { WORKFLOW_CHECKS } from "@/lib/workflowChecks";
import type {
  WorkflowInstance as PrismaWorkflowInstance,
  WorkflowTemplate,
  WorkflowStep,
  WorkflowChecklistItem,
  WorkflowStepCompletion,
  WorkflowChecklistCompletion,
  EntityStatus,
  PermissionResource,
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
  checks: readonly string[];
};

type AvailableTemplate = { id: string; name: string };

type WorkflowPanelProps = {
  instances: InstanceWithData[];
  availableTemplates: AvailableTemplate[];
  entityType: WorkflowEntityType;
  entityStatus?: EntityStatus | null;
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

function LockIcon() {
  return (
    <svg className="w-3 h-3 text-gray-400 dark:text-gray-500" viewBox="0 0 12 14" fill="none">
      <rect x="1.5" y="6" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M3.5 6V4a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function optional(item: { required: boolean }) {
  return item.required ? null : <span className="text-xs text-gray-400 dark:text-gray-500"> (optional)</span>;
}

function WorkflowInstancePanel({
  instance,
  isCancelled,
  canWrite,
  resource,
  removeWorkflow,
  toggleStep,
  toggleItem,
}: {
  instance: InstanceWithData;
  isCancelled: boolean;
  canWrite: boolean;
  resource: PermissionResource;
  removeWorkflow: (instanceId: string) => Promise<void>;
  toggleStep: (instanceId: string, stepId: string) => Promise<void>;
  toggleItem: (instanceId: string, itemId: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const completedItemIds = new Set(instance.itemCompletions.map((c) => c.itemId));
  const progress = instanceProgress(instance);
  const { ticksTotal: total, ticksDone: done } = progress;
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
      <div className="flex justify-between items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-3 min-w-0">
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
        <span className="shrink-0">
          <InlineConfirmButton
            onConfirm={() => removeWorkflow(instance.id)}
            label="Remove"
            resource={resource}
            requiredLevel="WRITE"
            className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 text-xs"
          />
        </span>
      </div>

      {instance.template.steps.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {instance.template.steps.map((step, index) => {
            const sp = progress.steps[index];
            const stepDone = sp.status === "done";
            const isChecklistStep = step.items.length > 0;
            const stepPending = pending === `step:${step.id}`;
            const prevDone = index === 0 || progress.steps[index - 1].status === "done";
            // Read-only reuses the lock the cancelled state already defines:
            // checkboxes render as static markers rather than buttons.
            const isLocked = isCancelled || !canWrite || (!stepDone && !prevDone);
            // Ticked by hand: a manual step with no required items, or a
            // confirmed prompt step (to take the confirm back). An automatic
            // step follows its check; a prompt step is confirmed below.
            const tickable = (sp.mode === "MANUAL" && sp.itemsRequired === 0) || (sp.mode === "PROMPT" && stepDone);
            const note = stepDone
              ? null
              : sp.itemsRequired > 0 && sp.itemsDone < sp.itemsRequired
                ? `${sp.itemsDone}/${sp.itemsRequired}`
                : sp.check && !sp.checkHolds
                  ? WORKFLOW_CHECKS[sp.check].pending
                  : null;
            const labelClass = `text-sm ${stepDone ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-white"}`;
            const marker = (hover: boolean) => (
              <span
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  stepDone
                    ? "border-green-500 bg-green-500"
                    : `border-gray-300 dark:border-gray-600${hover ? " hover:border-blue-400" : ""}`
                } ${stepPending ? "opacity-50" : ""}`}
              >
                {stepDone && <CheckIcon />}
              </span>
            );

            return (
              <div key={step.id} className={isLocked && !stepDone ? "opacity-50" : undefined}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-5 shrink-0 text-right">
                    {index + 1}
                  </span>
                  {tickable && !isLocked ? (
                    <button
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      onClick={() => handleToggleStep(step.id)}
                      disabled={stepPending}
                    >
                      {marker(true)}
                      <span className={labelClass}>{step.label}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {marker(false)}
                      <span className={labelClass}>{step.label}</span>
                    </div>
                  )}
                  {sp.mode === "AUTO" && sp.check && (
                    <span
                      title={WORKFLOW_CHECKS[sp.check].label}
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0"
                    >
                      Auto
                    </span>
                  )}
                  {note && <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{note}</span>}
                  {isLocked && !stepDone && tickable && (
                    <span className="shrink-0"><LockIcon /></span>
                  )}
                </div>
                {sp.status === "prompt" && !isLocked && (
                  <div className="flex items-center gap-2 pl-12 pr-4 pb-2.5 -mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Looks done</span>
                    <button
                      onClick={() => handleToggleStep(step.id)}
                      disabled={stepPending}
                      title={sp.check ? WORKFLOW_CHECKS[sp.check].label : undefined}
                      className="text-xs px-2 py-0.5 rounded bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                )}

                {isChecklistStep && (
                  <div className="pb-1">
                    {step.items.map((item) => {
                      const itemDone = completedItemIds.has(item.id);
                      const itemPending = pending === `item:${item.id}`;
                      const itemLocked = isLocked && !itemDone;
                      return itemLocked ? (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 w-full px-4 py-1.5 cursor-default"
                        >
                          <span className="w-5 shrink-0" />
                          <span className="w-3.5 h-3.5 rounded border border-gray-300 dark:border-gray-600 flex items-center justify-center shrink-0" />
                          <span className="text-xs text-gray-700 dark:text-gray-300">{item.label}{optional(item)}</span>
                        </div>
                      ) : (
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
                          {optional(item)}
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
  entityType,
  entityStatus,
  assignWorkflow,
  removeWorkflow,
  toggleStep,
  toggleItem,
}: WorkflowPanelProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const isCancelled = entityStatus === "CANCELLED";
  const canWrite = useCanWrite(ENTITY_TYPE_RESOURCE[entityType]);

  const handleAssign = async () => {
    if (!selectedTemplateId) return;
    setAssigning(true);
    await assignWorkflow(selectedTemplateId);
    setSelectedTemplateId("");
    setAssigning(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Workflows</h2>

      <div className="space-y-3">
        {instances.map((instance) => (
          <WorkflowInstancePanel
            key={instance.id}
            instance={instance}
            isCancelled={isCancelled}
            canWrite={canWrite}
            resource={ENTITY_TYPE_RESOURCE[entityType]}
            removeWorkflow={removeWorkflow}
            toggleStep={toggleStep}
            toggleItem={toggleItem}
          />
        ))}

        {!canWrite ? (
          instances.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 pt-1">
              No workflows assigned.
            </p>
          )
        ) : availableTemplates.length > 0 ? (
          <div className="flex items-center gap-2 pt-1">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
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
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 pt-1">
            {instances.length === 0
              ? "No workflows available. "
              : "All available workflows assigned. "}
            <Link href="/workflows" className="text-blue-600 dark:text-blue-400 hover:underline">
              Manage workflows
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
