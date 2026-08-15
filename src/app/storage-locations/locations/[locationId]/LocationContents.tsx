"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { Equipment, InventoryItem, LocationKind } from "@prisma/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GroupedEquipmentSelect } from "@/components/ui/GroupedEquipmentSelect";
import { LocationSelect, type LocationOption } from "@/components/ui/LocationSelect";

type ItemWithEquipment = InventoryItem & {
  equipment: { id: string; name: string; category: string } | null;
};

type LocationSummary = {
  id: string;
  name: string;
  kind: LocationKind;
  type: string | null;
  notes: string | null;
  archived: boolean;
};

type Props = {
  location: LocationSummary;
  /** Root-first, excluding the location itself. */
  ancestors: { id: string; name: string }[];
  items: ItemWithEquipment[];
  equipmentOptions: Equipment[];
  moveOptions: LocationOption[];
  canWrite: boolean;
  canDelete: boolean;
  createItem: (formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  moveItems: (ids: string[], targetLocationId: string) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
};

const inputClass =
  "w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

/** Container lines carry their identity in the equipment link when unnamed. */
function itemTitle(item: ItemWithEquipment): string {
  return item.name ?? item.equipment?.name ?? "Untitled item";
}

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

function ItemFields({
  item,
  equipmentOptions,
  nameRef,
}: {
  item?: ItemWithEquipment;
  equipmentOptions: Equipment[];
  nameRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name
        </label>
        <input
          ref={nameRef}
          type="text"
          name="name"
          defaultValue={item?.name ?? ""}
          placeholder="e.g. Lanyards, blue"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Quantity
        </label>
        <input
          type="number"
          name="quantity"
          min={0}
          defaultValue={item?.quantity ?? ""}
          placeholder="e.g. 200"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Equipment (optional)
        </label>
        <GroupedEquipmentSelect options={equipmentOptions} defaultValue={item?.equipmentId ?? null} />
      </div>
      <div className="sm:col-span-4">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes
        </label>
        <input
          type="text"
          name="notes"
          defaultValue={item?.notes ?? ""}
          placeholder="Additional notes..."
          className={inputClass}
        />
      </div>
    </div>
  );
}

/**
 * Stays open after a submit and refocuses the name field: initial inventory is a
 * long typing session, not a one-off create. The action returns void without a
 * redirect, the same shape the supply order item panel uses, which is what makes
 * staying open possible.
 */
function AddItemForm({
  equipmentOptions,
  createItem,
}: {
  equipmentOptions: Equipment[];
  createItem: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        setError(null);
        try {
          await createItem(formData);
          formRef.current?.reset();
          nameRef.current?.focus();
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't add that item.");
        }
      }}
      className="space-y-2"
    >
      <ItemFields equipmentOptions={equipmentOptions} nameRef={nameRef} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Add item" />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Stays open so you can keep going.
        </span>
      </div>
    </form>
  );
}

function EditItemForm({
  item,
  equipmentOptions,
  onSubmit,
  onCancel,
}: {
  item: ItemWithEquipment;
  equipmentOptions: Equipment[];
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setError(null);
        try {
          await onSubmit(formData);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't save that item.");
        }
      }}
      className="space-y-2"
    >
      <ItemFields item={item} equipmentOptions={equipmentOptions} />
      <input type="hidden" name="archived" value={item.archived ? "true" : "false"} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <SubmitButton label="Save" />
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ItemActions({
  item,
  canWrite,
  canDelete,
  onEdit,
  onArchive,
  onDelete,
}: {
  item: ItemWithEquipment;
  canWrite: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="shrink-0 flex gap-3 text-xs">
      {canWrite && (
        <>
          <button
            type="button"
            onClick={onEdit}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="text-gray-600 dark:text-gray-400 hover:underline"
          >
            {item.archived ? "Restore" : "Archive"}
          </button>
        </>
      )}
      {canDelete &&
        (confirming ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              className="text-red-600 dark:text-red-400 hover:underline"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-gray-600 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-red-600 dark:text-red-400 hover:underline"
          >
            Delete
          </button>
        ))}
    </div>
  );
}

export function LocationContents({
  location,
  ancestors,
  items,
  equipmentOptions,
  moveOptions,
  canWrite,
  canDelete,
  createItem,
  updateItem,
  setArchived,
  moveItems,
  deleteItems,
}: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [showMove, setShowMove] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const archivedCount = items.filter((i) => i.archived).length;
  const visible = showArchived ? items : items.filter((i) => !i.archived);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    setShowMove(false);
    setMoveTarget("");
    setConfirmingBulkDelete(false);
  };

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        clearSelection();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      }
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: "Locations", href: "/storage-locations/locations" },
          ...ancestors.map((node) => ({
            label: node.name,
            href: `/storage-locations/locations/${node.id}`,
          })),
          { label: location.name },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 mt-1">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">{location.name}</h2>
            {location.kind === "CONTAINER" && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Container
              </span>
            )}
            {location.type && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{location.type}</span>
            )}
            {location.archived && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                Archived
              </span>
            )}
          </div>
          {location.notes && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-0.5">
              {location.notes}
            </p>
          )}
        </div>
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
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {selected.size > 0 && (
        <div className="mb-3 p-3 rounded border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {selected.size} selected
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowMove((v) => !v)}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Move selected to…
              </button>
            )}
            {canDelete &&
              (confirmingBulkDelete ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => deleteItems(Array.from(selected)))}
                  className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  Confirm delete {selected.size}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingBulkDelete(true)}
                  className="text-red-600 dark:text-red-400 hover:underline"
                >
                  Delete selected
                </button>
              ))}
            <button
              type="button"
              onClick={clearSelection}
              className="text-gray-600 dark:text-gray-400 hover:underline"
            >
              Clear selection
            </button>
          </div>

          {showMove && canWrite && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <LocationSelect
                  options={moveOptions}
                  value={moveTarget}
                  onChange={setMoveTarget}
                  placeholder="— Select a destination —"
                />
              </div>
              <button
                type="button"
                disabled={isPending || !moveTarget}
                onClick={() => run(() => moveItems(Array.from(selected), moveTarget))}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "..." : "Move"}
              </button>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          Nothing recorded here yet.
        </p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700">
          {visible.map((item) => (
            <div key={item.id} className="p-3">
              {editingId === item.id ? (
                <EditItemForm
                  item={item}
                  equipmentOptions={equipmentOptions}
                  onSubmit={async (formData) => {
                    await updateItem(item.id, formData);
                    setEditingId(null);
                    router.refresh();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                    aria-label={`Select ${itemTitle(item)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {itemTitle(item)}
                      </span>
                      {item.quantity != null && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          × {item.quantity}
                        </span>
                      )}
                      {item.archived && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          Archived
                        </span>
                      )}
                    </div>
                    {item.equipment && item.name && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.equipment.category} · {item.equipment.name}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-xs italic text-gray-400 dark:text-gray-500 mt-0.5">
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <ItemActions
                    item={item}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    onEdit={() => setEditingId(item.id)}
                    onArchive={() => run(() => setArchived(item.id, !item.archived))}
                    onDelete={() => run(() => deleteItems([item.id]))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Add item</h3>
          <AddItemForm equipmentOptions={equipmentOptions} createItem={createItem} />
        </div>
      )}
    </div>
  );
}
