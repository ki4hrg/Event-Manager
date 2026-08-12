"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { CustomOption, LocationKind } from "@prisma/client";

export type LocationRow = {
  id: string;
  name: string;
  kind: LocationKind;
  type: string | null;
  parentId: string | null;
  notes: string | null;
  archived: boolean;
  depth: number;
  path: string;
  // Ids in this row's subtree — the parent picker uses it so a location can't
  // be moved inside itself.
  subtree: string[];
};

type Props = {
  locations: LocationRow[];
  types: CustomOption[];
  canWrite: boolean;
  canDelete: boolean;
  createLocation: (formData: FormData) => Promise<void>;
  updateLocation: (id: string, formData: FormData) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
};

const inputClass =
  "w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded"
    >
      {pending ? "..." : label}
    </button>
  );
}

function ParentSelect({
  locations,
  defaultValue,
  excludeId,
}: {
  locations: LocationRow[];
  defaultValue?: string | null;
  excludeId?: string;
}) {
  const excluded = excludeId
    ? new Set(locations.find((l) => l.id === excludeId)?.subtree ?? [excludeId])
    : null;
  return (
    <select name="parentId" defaultValue={defaultValue ?? ""} className={inputClass}>
      <option value="">— Top level —</option>
      {locations
        .filter((l) => !excluded?.has(l.id))
        .map((l) => (
          <option key={l.id} value={l.id}>
            {`${"  ".repeat(l.depth)}${l.name}`}
          </option>
        ))}
    </select>
  );
}

function LocationForm({
  location,
  locations,
  types,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  location?: LocationRow;
  locations: LocationRow[];
  types: CustomOption[];
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <form action={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          name="name"
          required
          autoFocus
          defaultValue={location?.name ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Place or Container
        </label>
        <select name="kind" defaultValue={location?.kind ?? "PLACE"} className={inputClass}>
          <option value="PLACE">Place — stays put</option>
          <option value="CONTAINER">Container — travels, gets packed</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Type
        </label>
        <select name="type" defaultValue={location?.type ?? ""} className={inputClass}>
          <option value="">— None —</option>
          {types.map((t) => (
            <option key={t.id} value={t.label}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Inside
        </label>
        <ParentSelect
          locations={locations}
          defaultValue={location?.parentId}
          excludeId={location?.id}
        />
      </div>

      {location && (
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              name="archived"
              value="true"
              defaultChecked={location.archived}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Archived — hidden from pickers, along with everything inside it
          </label>
        </div>
      )}

      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes
        </label>
        <input name="notes" defaultValue={location?.notes ?? ""} className={inputClass} />
      </div>

      <div className="md:col-span-2 flex gap-2">
        <SubmitButton label={submitLabel} />
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ArchiveButton({
  location,
  setArchived,
}: {
  location: LocationRow;
  setArchived: (id: string, archived: boolean) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => setArchived(location.id, !location.archived))}
      className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
    >
      {location.archived ? "Restore" : "Archive"}
    </button>
  );
}

export function StorageLocationTree({
  locations,
  types,
  canWrite,
  canDelete,
  createLocation,
  updateLocation,
  deleteLocation,
  setArchived,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = showArchived ? locations : locations.filter((l) => !l.archived);
  const archivedCount = locations.filter((l) => l.archived).length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Locations</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Nest locations to match how things are actually stored and moved.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show archived ({archivedCount})
            </label>
          )}
          {canWrite && !showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Add Location
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <LocationForm
            locations={locations}
            types={types}
            submitLabel="Create"
            onCancel={() => setShowAddForm(false)}
            onSubmit={async (formData) => {
              await createLocation(formData);
              setShowAddForm(false);
            }}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          No locations yet. Start with a top-level place like &quot;Off-Site Storage&quot;.
        </p>
      ) : (
        <div className="space-y-1">
          {visible.map((location) => (
            <div
              key={location.id}
              className="p-2 bg-gray-50 dark:bg-gray-900 rounded"
              style={{ marginLeft: `${location.depth * 1.25}rem` }}
            >
              {editingId === location.id ? (
                <LocationForm
                  location={location}
                  locations={locations}
                  types={types}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (formData) => {
                    await updateLocation(location.id, formData);
                    setEditingId(null);
                  }}
                />
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm text-gray-900 dark:text-white">{location.name}</span>
                    {location.kind === "CONTAINER" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        Container
                      </span>
                    )}
                    {location.type && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {location.type}
                      </span>
                    )}
                    {location.archived && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        Archived
                      </span>
                    )}
                    {location.notes && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                        {location.notes}
                      </span>
                    )}
                  </div>
                  {(canWrite || canDelete) && (
                    <div className="shrink-0 flex gap-3 text-sm">
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingId(location.id)}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Edit
                          </button>
                          <ArchiveButton location={location} setArchived={setArchived} />
                        </>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              confirm(
                                `Delete "${location.name}"? Anything inside it moves to the top level.`,
                              )
                            ) {
                              await deleteLocation(location.id);
                            }
                          }}
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
