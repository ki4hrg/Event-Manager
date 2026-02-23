"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CustomOption } from "@prisma/client";
import type { OptionCategory } from "./actions";

type OptionListProps = {
  title: string;
  description: string;
  category: OptionCategory;
  options: CustomOption[];
  showColor?: boolean;
  createOption: (formData: FormData) => Promise<void>;
  updateOption: (id: string, formData: FormData) => Promise<void>;
  deleteOption: (id: string) => Promise<void>;
};

const colorOptions = [
  { value: "", label: "None" },
  { value: "gray", label: "Gray" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
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

export function OptionList({
  title,
  description,
  category,
  options,
  showColor = false,
  createOption,
  updateOption,
  deleteOption,
}: OptionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {description}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      {showAddForm && (
        <form
          action={async (formData) => {
            await createOption(formData);
            setShowAddForm(false);
          }}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              name="label"
              placeholder="Label *"
              required
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <input
              type="text"
              name="value"
              placeholder="Value (auto-generated if empty)"
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            {showColor && (
              <select
                name="color"
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {colorOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-3 flex gap-2">
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

      {options.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No options defined yet. Click &quot;Add&quot; to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {options.map((option) => (
            <div
              key={option.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              {editingId === option.id ? (
                <form
                  action={async (formData) => {
                    await updateOption(option.id, formData);
                    setEditingId(null);
                  }}
                  className="flex-1 flex items-center gap-3"
                >
                  <input
                    type="text"
                    name="label"
                    defaultValue={option.label}
                    required
                    className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  <input
                    type="text"
                    name="value"
                    defaultValue={option.value}
                    required
                    className="w-32 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
                  />
                  {showColor && (
                    <select
                      name="color"
                      defaultValue={option.color || ""}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      {colorOptions.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <SubmitButton label="Save" />
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    {showColor && option.color && (
                      <span
                        className={`w-3 h-3 rounded-full bg-${option.color}-500`}
                        style={{
                          backgroundColor: `var(--color-${option.color}-500, ${option.color})`,
                        }}
                      />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {option.value}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingId(option.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete "${option.label}"?`)) {
                          await deleteOption(option.id);
                        }
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
