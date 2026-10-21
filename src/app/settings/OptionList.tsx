"use client";

import { startTransition, useState, useEffect, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { CustomOption } from "@prisma/client";
import type { OptionCategory } from "./actions";
import { MODEL_TYPES, MODEL_LABELS } from "@/app/vendors/model-types";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { useCanWrite } from "@/components/PermissionsProvider";

function ModelTypesCheckboxGroup({ defaultValues }: { defaultValues?: string[] }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Order Types</label>
      <div className="flex flex-wrap gap-3">
        {MODEL_TYPES.map((type) => (
          <label key={type.value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              name="models"
              value={type.value}
              defaultChecked={defaultValues?.includes(type.value)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            {type.label}
          </label>
        ))}
      </div>
    </div>
  );
}
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type GroupOption = { value: string; label: string };

// Optional per-option mapping to a fixed key (e.g. a meal type's APEX bucket).
// Rendering the select is what makes the form post `group`; lists without it
// leave the stored group untouched on edit.
function GroupSelect({
  label,
  groupOptions,
  defaultValue,
}: {
  label: string;
  groupOptions: GroupOption[];
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</span>
      <select
        name="group"
        defaultValue={defaultValue ?? ""}
        className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
      >
        <option value="">None</option>
        {groupOptions.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type OptionListProps = {
  title: string;
  description: string;
  category: OptionCategory;
  options: CustomOption[];
  showColor?: boolean;
  showModels?: boolean;
  groupOptions?: GroupOption[];
  groupLabel?: string;
  createOption: (formData: FormData) => Promise<void>;
  updateOption: (id: string, formData: FormData) => Promise<void>;
  deleteOption: (id: string) => Promise<void>;
  reorderOptions: (orderedIds: string[]) => Promise<void>;
  // Lists with one spelling per thing (amenities, concessions): fold an option
  // into another, moving every use.
  mergeOption?: (id: string, intoId: string) => Promise<void>;
};

const smallSelectClass =
  "px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

function MergeControl({ option, others, merge }: { option: CustomOption; others: CustomOption[]; merge: (intoId: string) => Promise<void> }) {
  const [intoId, setIntoId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const into = others.find((o) => o.id === intoId);
  if (others.length === 0 || option.isSystem) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
      <select
        aria-label="Merge into"
        value={intoId}
        onChange={(e) => {
          setIntoId(e.target.value);
          setConfirming(false);
        }}
        className={smallSelectClass}
      >
        <option value="">Merge into…</option>
        {others.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {into && !confirming && (
        <button type="button" onClick={() => setConfirming(true)} className="text-sm text-red-600 dark:text-red-400 hover:underline">
          Merge
        </button>
      )}
      {into && confirming && (
        <>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Every use of {option.label} becomes {into.label}.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => merge(into.id))}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Merging..." : "Confirm merge"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-sm text-gray-500 dark:text-gray-400">
            Cancel
          </button>
        </>
      )}
    </div>
  );
}

const colorOptions = [
  { value: "gray", bg: "bg-gray-500" },
  { value: "red", bg: "bg-red-500" },
  { value: "orange", bg: "bg-orange-500" },
  { value: "yellow", bg: "bg-yellow-500" },
  { value: "green", bg: "bg-green-500" },
  { value: "blue", bg: "bg-blue-500" },
  { value: "purple", bg: "bg-purple-500" },
  { value: "pink", bg: "bg-pink-500" },
];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function ColorPicker({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string;
}) {
  const [selected, setSelected] = useState(defaultValue || "");

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        onClick={() => setSelected("")}
        className={`w-6 h-6 rounded border-2 ${
          selected === ""
            ? "border-blue-500"
            : "border-gray-300 dark:border-gray-600"
        } bg-white dark:bg-gray-800 flex items-center justify-center text-gray-400 text-xs`}
        title="No color"
      >
        ×
      </button>
      {colorOptions.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => setSelected(c.value)}
          className={`w-6 h-6 rounded ${c.bg} border-2 ${
            selected === c.value
              ? "border-blue-500 ring-2 ring-blue-300"
              : "border-transparent"
          }`}
          title={c.value}
        />
      ))}
    </div>
  );
}

const colorBgClasses: Record<string, string> = {
  gray: "bg-gray-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

function SortableOptionRow({
  option,
  reordering,
  editingId,
  showColor,
  showModels,
  groupOptions,
  groupLabel,
  setEditingId,
  updateOption,
  deleteOption,
  mergeOption,
  others,
}: {
  option: CustomOption;
  reordering: boolean;
  editingId: string | null;
  showColor: boolean;
  showModels: boolean;
  groupOptions?: GroupOption[];
  groupLabel: string;
  setEditingId: (id: string | null) => void;
  updateOption: (id: string, formData: FormData) => Promise<void>;
  deleteOption: (id: string) => Promise<void>;
  mergeOption?: (id: string, intoId: string) => Promise<void>;
  others: CustomOption[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: option.id, disabled: !reordering });
  const canWrite = useCanWrite("SETTINGS");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
    >
      {editingId === option.id ? (
        <form
          action={async (formData) => {
            await updateOption(option.id, formData);
            setEditingId(null);
          }}
          className="space-y-3"
        >
          <div>
            <input
              type="text"
              name="label"
              defaultValue={option.label}
              required
              placeholder="Label"
              aria-label="Label"
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>
          {showColor && (
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Color
              </label>
              <ColorPicker name="color" defaultValue={option.color || ""} />
            </div>
          )}
          {showModels && <ModelTypesCheckboxGroup defaultValues={option.models} />}
          {groupOptions && (
            <GroupSelect label={groupLabel} groupOptions={groupOptions} defaultValue={option.group} />
          )}
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
          {mergeOption && (
            <MergeControl
              option={option}
              others={others}
              merge={async (intoId) => {
                await mergeOption(option.id, intoId);
                setEditingId(null);
              }}
            />
          )}
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            {reordering && (
              <button
                {...attributes}
                {...listeners}
                className="p-1 -m-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
                title="Drag to reorder"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                </svg>
              </button>
            )}
            {showColor && (
              <span
                className={`w-4 h-4 shrink-0 rounded ${
                  option.color
                    ? colorBgClasses[option.color] || "bg-gray-500"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
            <span className="font-medium text-gray-900 dark:text-white break-words min-w-0">
              {option.label}
            </span>
            {groupOptions && option.group && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {groupOptions.find((g) => g.value === option.group)?.label ?? option.group}
              </span>
            )}
            {showModels && option.models.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({option.models.map((m) => MODEL_LABELS[m] ?? m).join(", ")})
              </span>
            )}
          </div>
          {!reordering && (
            <div className="flex items-center gap-2 shrink-0">
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setEditingId(option.id)}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                >
                  Edit
                </button>
              )}
              {!option.isSystem && (
                <InlineDeleteButton
                  action={() => deleteOption(option.id)}
                  hiddenInputs={{}}
                  resource="SETTINGS"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OptionList({
  title,
  description,
  category,
  options,
  showColor = false,
  showModels = false,
  groupOptions,
  groupLabel = "Group",
  createOption,
  updateOption,
  deleteOption,
  reorderOptions,
  mergeOption,
}: OptionListProps) {
  const canWrite = useCanWrite("SETTINGS");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [localOptions, setLocalOptions] = useState(options);

  useEffect(() => {
    startTransition(() => setLocalOptions(options));
  }, [options]);

  const sensors = useSensors(useSensor(PointerSensor));

  const handleSortAlpha = async () => {
    const sorted = [...localOptions].sort((a, b) => a.label.localeCompare(b.label));
    setLocalOptions(sorted);
    await reorderOptions(sorted.map((o) => o.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localOptions.findIndex((o) => o.id === active.id);
    const newIndex = localOptions.findIndex((o) => o.id === over.id);
    const newOrder = arrayMove(localOptions, oldIndex, newIndex);
    setLocalOptions(newOrder);
    await reorderOptions(newOrder.map((o) => o.id));
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            {title}
          </h2>
          {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {canWrite && localOptions.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setReordering(!reordering)}
                className={`px-3 py-1.5 text-sm rounded border ${
                  reordering
                    ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950"
                    : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {reordering ? "Done" : "Reorder"}
              </button>
              {reordering && (
                <button
                  type="button"
                  onClick={handleSortAlpha}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Sort A–Z
                </button>
              )}
            </>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {showAddForm && canWrite && (
        <form
          action={async (formData) => {
            await createOption(formData);
            setShowAddForm(false);
          }}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
        >
          <div className="space-y-3">
            <div>
              <input
                type="text"
                name="label"
                placeholder="Label *"
                aria-label="Label"
                required
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            {showColor && (
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Color
                </label>
                <ColorPicker name="color" />
              </div>
            )}
            {showModels && <ModelTypesCheckboxGroup />}
            {groupOptions && <GroupSelect label={groupLabel} groupOptions={groupOptions} />}
          </div>
          <div className="mt-4 flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {localOptions.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No options yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localOptions.map((o) => o.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {localOptions.map((option) => (
                <SortableOptionRow
                  key={option.id}
                  option={option}
                  reordering={reordering}
                  editingId={editingId}
                  showColor={showColor}
                  showModels={showModels}
                  groupOptions={groupOptions}
                  groupLabel={groupLabel}
                  setEditingId={setEditingId}
                  updateOption={updateOption}
                  deleteOption={deleteOption}
                  mergeOption={mergeOption}
                  others={localOptions.filter((o) => o.id !== option.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
