import { ProgressStrip } from "@/components/ProgressStrip";
import { templateProgress, type ProgressInstanceInput, type ProgressStepInput } from "@/lib/workflowProgress";

type Instance = ProgressInstanceInput<ProgressStepInput & { label: string }> & { id: string; template: { name: string } };

// A record's workflows on its detail page: one strip per template, the step in
// progress marked. Ticking stays in WorkflowPanel.
export function WorkflowStrips({ instances }: { instances: Instance[] }) {
  const drawn = instances.filter((i) => i.template.steps.length > 0);
  if (drawn.length === 0) return null;
  return (
    <div className="mb-6 space-y-3">
      {drawn.map((inst) => {
        const { steps, current } = templateProgress(inst);
        return <ProgressStrip key={inst.id} steps={steps} current={current} label={`${inst.template.name} workflow`} title={inst.template.name} />;
      })}
    </div>
  );
}
