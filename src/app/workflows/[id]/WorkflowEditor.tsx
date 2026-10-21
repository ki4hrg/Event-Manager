"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  WorkflowTemplate,
  WorkflowStep,
  WorkflowChecklistItem,
  CustomOption,
  EntityStatus,
} from "@prisma/client";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";

type StepWithItems = WorkflowStep & { items: WorkflowChecklistItem[] };
type TemplateWithSteps = WorkflowTemplate & {
  steps: StepWithItems[];
  _count: { instances: number };
  pendingStatusValue: EntityStatus | null;
  pendingSubstatusValue: string | null;
  completionStatusValue: EntityStatus | null;
  completionSubstatusValue: string | null;
};

type WorkflowEditorProps = {
  template: TemplateWithSteps;
  substatuses: CustomOption[];
  updateTemplate: (formData: FormData) => Promise<void>;
  deleteTemplate: () => Promise<void>;
  createStep: (formData: FormData) => Promise<void>;
  updateStep: (id: string, formData: FormData) => Promise<void>;
  deleteStep: (id: string) => Promise<void>;
  createItem: (stepId: string, formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
};

const ENTITY_TYPE_OPTIONS = [
  { value: "function", label: "Function" },
  { value: "catering_order", label: "Catering Order" },
  { value: "av_order", label: "AV Order" },
  { value: "setup_order", label: "Setup Order" },
  { value: "print_order", label: "Print Order" },
  { value: "supply_order", label: "Supply Order" },
  { value: "media_deliverable", label: "Media Deliverable" },
  { value: "form_submission", label: "Form Submission" },
  { value: "presentation", label: "Presentation" },
];


function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

function ChecklistItemRow({
  item,
  updateItem,
  deleteItem,
}: {
  item: WorkflowChecklistItem;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await updateItem(item.id, fd);
          setEditing(false);
        }}
        className="flex items-center gap-2 pl-4"
      >
        <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
        <input
          type="text"
          name="label"
          defaultValue={item.label}
          required
          className="flex-1 min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
        <SubmitButton label="Save" />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 pl-4 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
        <span className="text-sm text-gray-700 dark:text-gray-300 break-words min-w-0">{item.label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => setEditing(true)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">
          Edit
        </button>
        <InlineConfirmButton
          onConfirm={() => deleteItem(item.id)}
          resource="WORKFLOWS"
          requiredLevel="DELETE"
          className="text-red-600 dark:text-red-400 hover:underline text-xs"
        />
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  substatuses,
  updateStep,
  deleteStep,
  createItem,
  updateItem,
  deleteItem,
}: {
  step: StepWithItems;
  index: number;
  substatuses: CustomOption[];
  updateStep: (id: string, formData: FormData) => Promise<void>;
  deleteStep: (id: string) => Promise<void>;
  createItem: (stepId: string, formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editPendingStatus, setEditPendingStatus] = useState<string>(step.pendingStatusValue ?? "");
  const filteredPendingSubstatuses = substatuses.filter((s) => s.group === (editPendingStatus || null));

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2">
      {editing ? (
        <form
          action={async (fd) => {
            await updateStep(step.id, fd);
            setEditing(false);
          }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0 w-6">
              {index + 1}.
            </span>
            <input
              type="text"
              name="label"
              defaultValue={step.label}
              required
              className="flex-1 min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>
          {/* Preserve current status when saving label */}
          <input type="hidden" name="pendingStatusValue" value={editPendingStatus} />
          <input type="hidden" name="pendingSubstatusValue" value={step.pendingSubstatusValue ?? ""} />
          <div className="flex items-center gap-2 pl-6">
            <SubmitButton label="Save" />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-6 shrink-0">
                {index + 1}.
              </span>
              <span className="font-medium text-gray-900 dark:text-white text-sm">{step.label}</span>
              {step.items.length > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({step.items.length} checklist item{step.items.length !== 1 ? "s" : ""})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAddingItem(true)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-xs"
              >
                + Checklist item
              </button>
              <button
                onClick={() => setEditing(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                Edit
              </button>
              <InlineConfirmButton
                onConfirm={() => deleteStep(step.id)}
                prompt={step.items.length > 0 ? "Also deletes its checklist items." : undefined}
                resource="WORKFLOWS"
                requiredLevel="DELETE"
              />
            </div>
          </div>

          {/* Always-visible inline status form */}
          <form
            action={async (fd) => {
              await updateStep(step.id, fd);
            }}
            className="grid grid-cols-1 gap-2 pl-6 sm:flex sm:items-center"
          >
            <input type="hidden" name="label" value={step.label} />
            <label className="text-xs text-gray-500 dark:text-gray-400 sm:w-16 sm:shrink-0">
              Status
            </label>
            <select
              name="pendingStatusValue"
              value={editPendingStatus}
              onChange={(e) => {
                setEditPendingStatus(e.target.value);
                e.currentTarget.form?.requestSubmit();
              }}
              className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="">None</option>
              {EDIT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {editPendingStatus && filteredPendingSubstatuses.length > 0 && (
              <select
                name="pendingSubstatusValue"
                defaultValue={step.pendingSubstatusValue ?? ""}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                <option value="">No substatus</option>
                {filteredPendingSubstatuses.map((s) => (
                  <option key={s.id} value={s.label}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </form>
        </>
      )}

      {step.items.map((item) => (
        <ChecklistItemRow
          key={item.id}
          item={item}
          updateItem={updateItem}
          deleteItem={deleteItem}
        />
      ))}

      {addingItem && (
        <form
          action={async (fd) => {
            await createItem(step.id, fd);
            setAddingItem(false);
          }}
          className="flex items-center gap-2 pl-4"
        >
          <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
          <input
            type="text"
            name="label"
            placeholder="Checklist item label"
            required
            autoFocus
            className="flex-1 min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
          <SubmitButton label="Add" />
          <button
            type="button"
            onClick={() => setAddingItem(false)}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

export function WorkflowEditor({
  template,
  substatuses,
  updateTemplate,
  deleteTemplate,
  createStep,
  updateStep,
  deleteStep,
  createItem,
  updateItem,
  deleteItem,
}: WorkflowEditorProps) {
  const [editingName, setEditingName] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [addStepPendingStatus, setAddStepPendingStatus] = useState<string>("");
  const [editTemplatePendingStatus, setEditTemplatePendingStatus] = useState<string>(template.pendingStatusValue ?? "");
  const [editCompletionStatus, setEditCompletionStatus] = useState<string>(template.completionStatusValue ?? "");
  const filteredAddPendingSubstatuses = substatuses.filter((s) => s.group === (addStepPendingStatus || null));
  const filteredTemplatePendingSubstatuses = substatuses.filter((s) => s.group === (editTemplatePendingStatus || null));
  const filteredCompletionSubstatuses = substatuses.filter((s) => s.group === (editCompletionStatus || null));

  return (
    <div className="space-y-6">
      {/* Template header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
        {editingName ? (
          <form
            action={async (fd) => {
              await updateTemplate(fd);
              setEditingName(false);
            }}
            className="space-y-4"
          >
            <input
              type="text"
              name="name"
              defaultValue={template.name}
              required
              placeholder="Workflow name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <textarea
              name="description"
              defaultValue={template.description || ""}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Auto-assign to new
              </p>
              <div className="flex flex-wrap gap-3">
                {ENTITY_TYPE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      name="defaultForEntityTypes"
                      value={opt.value}
                      defaultChecked={template.defaultForEntityTypes.includes(opt.value)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Pending status
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                Applied when assigned but no steps completed
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  name="pendingStatusValue"
                  value={editTemplatePendingStatus}
                  onChange={(e) => setEditTemplatePendingStatus(e.target.value)}
                  className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">None</option>
                  {EDIT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {editTemplatePendingStatus && filteredTemplatePendingSubstatuses.length > 0 && (
                  <select
                    name="pendingSubstatusValue"
                    defaultValue={template.pendingSubstatusValue ?? ""}
                    className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">No substatus</option>
                    {filteredTemplatePendingSubstatuses.map((s) => (
                      <option key={s.id} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Completion status
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  name="completionStatusValue"
                  value={editCompletionStatus}
                  onChange={(e) => setEditCompletionStatus(e.target.value)}
                  className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">None</option>
                  {EDIT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {editCompletionStatus && filteredCompletionSubstatuses.length > 0 && (
                  <select
                    name="completionSubstatusValue"
                    defaultValue={template.completionSubstatusValue ?? ""}
                    className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">No substatus</option>
                    {filteredCompletionSubstatuses.map((s) => (
                      <option key={s.id} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <SubmitButton label="Save" />
              <button
                type="button"
                onClick={() => {
                  setEditTemplatePendingStatus(template.pendingStatusValue ?? "");
                  setEditCompletionStatus(template.completionStatusValue ?? "");
                  setEditingName(false);
                }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white break-words">
                {template.name}
              </h1>
              {template.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {template.description}
                </p>
              )}
              {template.defaultForEntityTypes.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Auto-assigned to:{" "}
                  {template.defaultForEntityTypes
                    .map(
                      (v) => ENTITY_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v
                    )
                    .join(", ")}
                </p>
              )}
              {template.pendingStatusValue && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Pending:{" "}
                  <span className="text-amber-600 dark:text-amber-400">
                    {EDIT_STATUS_OPTIONS.find((o) => o.value === template.pendingStatusValue)?.label ?? template.pendingStatusValue}
                    {template.pendingSubstatusValue ? ` / ${template.pendingSubstatusValue}` : ""}
                  </span>
                </p>
              )}
              {template.completionStatusValue && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Completion:{" "}
                  <span className="text-amber-600 dark:text-amber-400">
                    {EDIT_STATUS_OPTIONS.find((o) => o.value === template.completionStatusValue)?.label ?? template.completionStatusValue}
                    {template.completionSubstatusValue ? ` / ${template.completionSubstatusValue}` : ""}
                  </span>
                </p>
              )}
              {template._count.instances > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Assigned to {template._count.instances} item
                  {template._count.instances !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setEditingName(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                Edit
              </button>
              <InlineConfirmButton
                onConfirm={() => deleteTemplate()}
                prompt={
                  template._count.instances > 0
                    ? `Removes ${template._count.instances} assignment${template._count.instances !== 1 ? "s" : ""}.`
                    : undefined
                }
                resource="WORKFLOWS"
                requiredLevel="DELETE"
              />
            </div>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Steps</h2>
          <button
            onClick={() => setAddingStep(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Step
          </button>
        </div>

        {template.steps.length === 0 && !addingStep && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No steps yet.
          </p>
        )}

        <div className="space-y-2">
          {template.steps.map((step, index) => (
            <StepRow
              key={`${step.id}-${step.updatedAt.toISOString()}`}
              step={step}
              index={index}
              substatuses={substatuses}
              updateStep={updateStep}
              deleteStep={deleteStep}
              createItem={createItem}
              updateItem={updateItem}
              deleteItem={deleteItem}
            />
          ))}
        </div>

        {addingStep && (
          <form
            action={async (fd) => {
              await createStep(fd);
              setAddingStep(false);
              setAddStepPendingStatus("");
            }}
            className="mt-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-6 shrink-0">
                {template.steps.length + 1}.
              </span>
              <input
                type="text"
                name="label"
                placeholder="Step label"
                required
                autoFocus
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 pl-6 sm:flex sm:items-center">
              <label className="text-xs text-gray-500 dark:text-gray-400 sm:w-16 sm:shrink-0">
                Status
              </label>
              <select
                name="pendingStatusValue"
                value={addStepPendingStatus}
                onChange={(e) => setAddStepPendingStatus(e.target.value)}
                className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                <option value="">None</option>
                {EDIT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {addStepPendingStatus && filteredAddPendingSubstatuses.length > 0 && (
                <select
                  name="pendingSubstatusValue"
                  defaultValue=""
                  className="w-full sm:w-auto min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">No substatus</option>
                  {filteredAddPendingSubstatuses.map((s) => (
                    <option key={s.id} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2 pl-6">
              <SubmitButton label="Add" />
              <button
                type="button"
                onClick={() => {
                  setAddingStep(false);
                  setAddStepPendingStatus("");
                }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
