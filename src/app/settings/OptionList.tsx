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
      {pending ? "..." : label}
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
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            {showColor && (
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Color
                </label>
                <ColorPicker name="color" />
              </div>
            )}
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

      {options.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No options defined yet. Click &quot;Add&quot; to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {options.map((option) => (
            <div
              key={option.id}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      name="label"
                      defaultValue={option.label}
                      required
                      placeholder="Label"
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                    <input
                      type="text"
                      name="value"
                      defaultValue={option.value}
                      required
                      placeholder="Value"
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
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
                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {showColor && (
                      <span
                        className={`w-4 h-4 rounded ${
                          option.color
                            ? colorBgClasses[option.color] || "bg-gray-500"
                            : "bg-gray-200 dark:bg-gray-700"
                        }`}
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
