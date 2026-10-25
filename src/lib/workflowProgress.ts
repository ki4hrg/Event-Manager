// The one rule for how far a workflow instance has got. A step without
// checklist items is done when ticked; a step with items is done when every
// item is ticked. Steps run in order, so an instance's current step is the
// first one not done. Every reader (list counts, the detail badge, the panel,
// the status recompute, form approval) goes through here, so a change to the
// rule lands everywhere at once. Pure; safe on the server and the client.

export type ProgressStepInput = { id: string; items: { id: string }[] };

export type ProgressInstanceInput<S extends ProgressStepInput = ProgressStepInput> = {
  template: { steps: S[] };
  stepCompletions: { stepId: string }[];
  itemCompletions: { itemId: string }[];
};

// "partial": a step with items, some (not all) of them ticked.
export type StepStatus = "done" | "partial" | "open";

export type StepProgress = { status: StepStatus; itemsDone: number; itemsRequired: number };

export type InstanceProgress = {
  steps: StepProgress[]; // in the template's step order
  current: number | null; // index of the first step not done; null when all are
  stepsDone: number;
  // A step without items counts as one tick, a step with items as one per item.
  ticksDone: number;
  ticksTotal: number;
};

// Counts across every workflow on a record, for the list and detail badges.
export type WorkflowBadgeSummary = { count: number; done: number; total: number };

export type CompletionSets = { steps: Set<string>; items: Set<string> };

export function completionSets(instance: Pick<ProgressInstanceInput, "stepCompletions" | "itemCompletions">): CompletionSets {
  return {
    steps: new Set(instance.stepCompletions.map((c) => c.stepId)),
    items: new Set(instance.itemCompletions.map((c) => c.itemId)),
  };
}

export function stepProgress(step: ProgressStepInput, done: CompletionSets): StepProgress {
  if (step.items.length === 0) {
    return { status: done.steps.has(step.id) ? "done" : "open", itemsDone: 0, itemsRequired: 0 };
  }
  const itemsDone = step.items.filter((i) => done.items.has(i.id)).length;
  const itemsRequired = step.items.length;
  return { status: itemsDone === itemsRequired ? "done" : itemsDone > 0 ? "partial" : "open", itemsDone, itemsRequired };
}

export function instanceProgress(instance: ProgressInstanceInput): InstanceProgress {
  const done = completionSets(instance);
  const steps = instance.template.steps.map((s) => stepProgress(s, done));
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

// A template instance as strip steps. The current step is "active", or
// "partial" when some of its items are ticked; steps after it are "todo".
export function templateProgress(
  instance: ProgressInstanceInput<ProgressStepInput & { label: string }>,
): { steps: ProgressStep[]; current: string | null } {
  const p = instanceProgress(instance);
  const steps = instance.template.steps.map((s, i): ProgressStep => {
    const sp = p.steps[i];
    const status: ProgressStatus =
      sp.status === "done" ? "done" : sp.status === "partial" ? "partial" : i === p.current ? "active" : "todo";
    const state = sp.itemsRequired > 0 ? `${sp.itemsDone} of ${sp.itemsRequired}` : sp.status === "done" ? "Done" : "To do";
    return { key: s.id, label: s.label, state, status, href: null };
  });
  return { steps, current: p.current === null ? null : instance.template.steps[p.current].id };
}
