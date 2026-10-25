// The one rule for how far a workflow instance has got. Every reader (list
// counts, the detail badge and strip, the panel, the status recompute, form
// approval, the overview) goes through here, so a change to the rule lands
// everywhere at once. Pure; safe on the server and the client.
//
// A step's required checklist items come first: optional items never hold a
// step back, and a step with only optional items behaves as if it had none.
// Once the required items are ticked, the step's completion mode decides:
//   MANUAL  done when its required items are ticked, or (with none) when ticked
//   AUTO    done exactly while its check holds; never stored, so it re-opens
//   PROMPT  "prompt" (looks done, confirm) while its check holds; done once confirmed
// AUTO and PROMPT without a known check behave as MANUAL. Steps run in order,
// so an instance's current step is the first one not done.

import type { WorkflowCompletionMode } from "@prisma/client";
import { WORKFLOW_CHECKS, isWorkflowCheckKey, type WorkflowCheckKey } from "@/lib/workflowChecks";

export type ProgressStepInput = {
  id: string;
  completionMode: WorkflowCompletionMode;
  computedKey: string | null;
  items: { id: string; required: boolean }[];
};

export type ProgressInstanceInput<S extends ProgressStepInput = ProgressStepInput> = {
  template: { steps: S[] };
  stepCompletions: { stepId: string }[];
  itemCompletions: { itemId: string }[];
  checks: readonly string[]; // the record's checks that hold (src/lib/workflowCheckData.ts)
};

// "partial": some (not all) required items ticked. "prompt": a PROMPT step
// whose conditions hold, waiting for a confirm; it counts as not done.
export type StepStatus = "done" | "partial" | "open" | "prompt";

export type StepProgress = {
  status: StepStatus;
  mode: WorkflowCompletionMode; // as applied (MANUAL when AUTO / PROMPT has no check)
  check: WorkflowCheckKey | null;
  checkHolds: boolean;
  itemsDone: number; // required items ticked
  itemsRequired: number;
};

export type InstanceProgress = {
  steps: StepProgress[]; // in the template's step order
  current: number | null; // index of the first step not done; null when all are
  stepsDone: number;
  // A step without required items counts as one tick, a step with them as one per item.
  ticksDone: number;
  ticksTotal: number;
};

// Counts across every workflow on a record, for the list and detail badges.
export type WorkflowBadgeSummary = { count: number; done: number; total: number };

// A list row's workflows, each as dots (getWorkflowBadgeSummaries).
export type WorkflowRowSummary = WorkflowBadgeSummary & {
  workflows: { id: string; templateId: string; name: string; steps: ProgressStep[] }[];
};

export type CompletionSets = { steps: Set<string>; items: Set<string> };

export function completionSets(instance: Pick<ProgressInstanceInput, "stepCompletions" | "itemCompletions">): CompletionSets {
  return {
    steps: new Set(instance.stepCompletions.map((c) => c.stepId)),
    items: new Set(instance.itemCompletions.map((c) => c.itemId)),
  };
}

export function stepProgress(step: ProgressStepInput, done: CompletionSets, checks: readonly string[]): StepProgress {
  const required = step.items.filter((i) => i.required);
  const itemsDone = required.filter((i) => done.items.has(i.id)).length;
  const itemsRequired = required.length;
  const itemsMet = itemsDone === itemsRequired;
  const check = isWorkflowCheckKey(step.computedKey) ? step.computedKey : null;
  const checkHolds = check !== null && checks.includes(check);
  const mode: WorkflowCompletionMode = check ? step.completionMode : "MANUAL";
  const ticked = done.steps.has(step.id);
  const notYet: StepStatus = itemsDone > 0 ? "partial" : "open";

  let status: StepStatus;
  switch (mode) {
    case "AUTO":
      status = itemsMet && checkHolds ? "done" : notYet;
      break;
    case "PROMPT":
      status = ticked ? "done" : itemsMet && checkHolds ? "prompt" : notYet;
      break;
    case "MANUAL":
      status = itemsRequired > 0 ? (itemsMet ? "done" : notYet) : ticked ? "done" : "open";
      break;
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unhandled completion mode: ${_exhaustive}`);
    }
  }
  return { status, mode, check, checkHolds, itemsDone, itemsRequired };
}

export function instanceProgress(instance: ProgressInstanceInput): InstanceProgress {
  const done = completionSets(instance);
  const steps = instance.template.steps.map((s) => stepProgress(s, done, instance.checks));
  const current = steps.findIndex((s) => s.status !== "done");
  let ticksDone = 0;
  let ticksTotal = 0;
  for (const s of steps) {
    if (s.itemsRequired === 0) {
      ticksTotal += 1;
      if (s.status === "done") ticksDone += 1;
    } else {
      ticksTotal += s.itemsRequired;
      ticksDone += s.itemsDone;
    }
  }
  return {
    steps,
    current: current === -1 ? null : current,
    stepsDone: steps.filter((s) => s.status === "done").length,
    ticksDone,
    ticksTotal,
  };
}

export function isInstanceComplete(instance: ProgressInstanceInput): boolean {
  return instanceProgress(instance).current === null;
}

export function workflowBadgeSummary(instances: ProgressInstanceInput[]): WorkflowBadgeSummary | null {
  if (instances.length === 0) return null;
  let done = 0;
  let total = 0;
  for (const inst of instances) {
    const p = instanceProgress(inst);
    done += p.ticksDone;
    total += p.ticksTotal;
  }
  return { count: instances.length, done, total };
}

// One step as the shared strip and dots draw it (src/components/ProgressStrip.tsx).
// Hotels build these from their own chain (src/lib/hotelWorkflow.ts); templates
// through templateProgress.
export type ProgressStatus = "done" | "partial" | "active" | "todo" | "skipped" | "stopped";
export type ProgressStep = {
  key: string;
  label: string;
  state: string; // one line under the label
  status: ProgressStatus;
  href: string | null;
};

// The strip's one-line state for a step not yet done.
function openState(sp: StepProgress): string {
  if (sp.status === "prompt") return "Looks done · confirm";
  if (sp.itemsRequired > 0 && sp.itemsDone < sp.itemsRequired) return `${sp.itemsDone} of ${sp.itemsRequired}`;
  if (sp.check && !sp.checkHolds) return WORKFLOW_CHECKS[sp.check].pending;
  return "To do";
}

// A template instance as strip steps. The current step is "active", or
// "partial" when some of its items are ticked; steps after it are "todo". A
// prompt step waiting on a confirm shows as active.
export function templateProgress(
  instance: ProgressInstanceInput<ProgressStepInput & { label: string }>,
): { steps: ProgressStep[]; current: string | null } {
  const p = instanceProgress(instance);
  const steps = instance.template.steps.map((s, i): ProgressStep => {
    const sp = p.steps[i];
    const status: ProgressStatus =
      sp.status === "done" ? "done" : sp.status === "partial" ? "partial" : i === p.current ? "active" : "todo";
    return { key: s.id, label: s.label, state: sp.status === "done" ? "Done" : openState(sp), status, href: null };
  });
  return { steps, current: p.current === null ? null : instance.template.steps[p.current].id };
}

// List pages filter on `?step=`: a template step's id (records whose workflow
// is on that step) or `done:<templateId>` (records whose workflow is through).
// The event overview's per-step counts link here.
export const DONE_STEP_PREFIX = "done:";

function workflowAt(w: WorkflowRowSummary["workflows"][number], step: string) {
  if (step.startsWith(DONE_STEP_PREFIX)) {
    return w.templateId === step.slice(DONE_STEP_PREFIX.length) && w.steps.every((s) => s.status === "done");
  }
  return w.steps.some((s) => s.key === step && (s.status === "active" || s.status === "partial"));
}

// The filter's chip label, or null when no row's workflow knows the step (a
// stale or hand-edited link means no filter, not an empty list).
export function stepFilterLabel(summaries: Record<string, WorkflowRowSummary>, step: string | undefined): string | null {
  if (!step) return null;
  for (const summary of Object.values(summaries)) {
    for (const w of summary.workflows) {
      if (step === `${DONE_STEP_PREFIX}${w.templateId}`) return `${w.name}: done`;
      const s = w.steps.find((x) => x.key === step);
      if (s) return `${w.name}: ${s.label}`;
    }
  }
  return null;
}

export function atWorkflowStep(summary: WorkflowRowSummary | undefined, step: string): boolean {
  return summary?.workflows.some((w) => workflowAt(w, step)) ?? false;
}

// How many records sit at each step of one template, for the event overview.
export type WorkflowStepCount = { key: string; label: string; count: number };
export function countAtSteps(
  template: { id: string; steps: { id: string; label: string }[] },
  instances: ProgressInstanceInput[],
): WorkflowStepCount[] {
  const counts = new Map<string, number>();
  let done = 0;
  for (const inst of instances) {
    const { current } = instanceProgress(inst);
    if (current === null) done += 1;
    else {
      const id = inst.template.steps[current].id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [
    ...template.steps.map((s) => ({ key: s.id, label: s.label, count: counts.get(s.id) ?? 0 })),
    { key: `${DONE_STEP_PREFIX}${template.id}`, label: "Done", count: done },
  ];
}
