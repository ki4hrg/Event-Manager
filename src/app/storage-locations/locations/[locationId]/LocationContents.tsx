"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { Equipment, InventoryItem, LocationKind } from "@prisma/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LocationSelect, type LocationOption } from "@/components/ui/LocationSelect";
import type { SupplyOrderTarget } from "../../actions";
import type { AddInventoryResult } from "@/app/events/supply-orders/core";
import { isUserError, type UserError } from "@/lib/userErrors";
import { keepFormValues } from "@/lib/keepFormValues";

type ItemWithEquipment = InventoryItem & {
  equipment: { id: string; name: string; category: string };
};

type NestedLocation = {
  id: string;
  name: string;
  kind: LocationKind;
  type: string | null;
  itemCount: number;
  childCount: number;
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
  /** Direct child locations — the boxes on this pallet, not the whole subtree. */
  nested: NestedLocation[];
  equipmentOptions: Equipment[];
  equipmentCategories: { id: string; label: string }[];
  moveOptions: LocationOption[];
  canWrite: boolean;
  canDelete: boolean;
  canManageEquipment: boolean;
  createEquipment: (name: string, category: string) => Promise<string>;
  /** Empty when the caller can't write supply orders anywhere; hides the bridge. */
  supplyOrderTargets: SupplyOrderTarget[];
  addToSupplyOrder: (
    inventoryItemIds: string[],
    supplyOrderId: string,
  ) => Promise<AddInventoryResult>;
  createItem: (formData: FormData) => Promise<void | UserError>;
  updateItem: (id: string, formData: FormData) => Promise<void | UserError>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  moveItems: (ids: string[], targetLocationId: string) => Promise<void | UserError>;
  deleteItems: (ids: string[]) => Promise<void | UserError>;
};

const inputClass =
  "w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

/** Equipment is the identity; name only qualifies it ("Lanyards — blue"). */
function itemTitle(item: ItemWithEquipment): string {
  return item.name ? `${item.equipment.name} — ${item.name}` : item.equipment.name;
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

/**
 * Inline catalog extension for admins. EQUIPMENT is admin-only in the seed, so a
 * packer holding STORAGE_LOCATIONS WRITE can file catalogued gear but not add to
 * the catalog — the affordance is simply absent for them.
 */
function InlineEquipmentCreate({
  categories,
  createEquipment,
  onCreated,
}: {
  categories: { id: string; label: string }[];
  createEquipment: (name: string, category: string) => Promise<string>;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        ＋ New equipment
      </button>
    );
  }

  return (
    <div className="mt-2 p-2 rounded border border-gray-200 dark:border-gray-700 space-y-2">
      <input
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Lanyards"
        className={inputClass}
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className={inputClass}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.label}>
            {c.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || !name.trim() || !category}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                onCreated(await createEquipment(name.trim(), category));
                setOpen(false);
                setName("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't create that equipment.");
              }
            })
          }
          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "..." : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="px-2 py-1 text-gray-600 dark:text-gray-400 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ItemFields({
  item,
  equipmentOptions,
  equipmentCategories,
  canManageEquipment,
  createEquipment,
  equipmentId,
  onEquipmentChange,
  detailRef,
}: {
  item?: ItemWithEquipment;
  equipmentOptions: Equipment[];
  equipmentCategories: { id: string; label: string }[];
  canManageEquipment: boolean;
  createEquipment: (name: string, category: string) => Promise<string>;
  equipmentId: string;
  onEquipmentChange: (value: string) => void;
  detailRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Equipment <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        {/* Controlled: inline create has to select an option that didn't exist a
            moment ago, the same reason SupplyOrderItemPanel's form is controlled. */}
        <select
          name="equipmentId"
          required
          value={equipmentId}
          onChange={(e) => onEquipmentChange(e.target.value)}
          className={inputClass}
        >
          <option value="">— Select equipment —</option>
          {Object.entries(
            equipmentOptions.reduce(
              (acc, e) => {
                const cat = e.category || "Other";
                (acc[cat] ||= []).push(e);
                return acc;
              },
              {} as Record<string, Equipment[]>,
            ),
          ).map(([cat, entries]) => (
            <optgroup key={cat} label={cat}>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Detail
        </label>
        <input
          ref={detailRef}
          type="text"
          // Field named `detail`, column named `name`: password managers key off
          // input names, and `name="name"` reliably summons an autofill overlay.
          // parseInventoryData maps it back.
          name="detail"
          defaultValue={item?.name ?? ""}
          placeholder="e.g. blue"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
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
      {/* Below the fields, not inside the equipment cell: tabbing out of the
          equipment select should land on Detail, not on a secondary affordance. */}
      {canManageEquipment && (
        <div className="sm:col-span-4">
          <InlineEquipmentCreate
            categories={equipmentCategories}
            createEquipment={createEquipment}
            onCreated={onEquipmentChange}
          />
        </div>
      )}
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

type FieldProps = {
  equipmentOptions: Equipment[];
  equipmentCategories: { id: string; label: string }[];
  canManageEquipment: boolean;
  createEquipment: (name: string, category: string) => Promise<string>;
};

/**
 * Stays open after submit and refocuses, because initial inventory is a long
 * typing session rather than a one-off create. Equipment persists between
 * submits — consecutive rows are usually the same category — while the detail
 * and quantity clear.
 */
function AddItemForm({
  fieldProps,
  createItem,
}: {
  fieldProps: FieldProps;
  createItem: (formData: FormData) => Promise<void | UserError>;
}) {
  const detailRef = useRef<HTMLInputElement>(null);
  const [equipmentId, setEquipmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  // React clears the form after an add, for the next item; keep what was
  // typed after a refusal (see keepFormValues). The submit button is
  // disabled while pending, so submissions don't overlap.
  const refused = useRef(false);
  const router = useRouter();

  return (
    <form
      onReset={(e) => {
        if (refused.current) keepFormValues(e);
      }}
      action={async (formData) => {
        setError(null);
        refused.current = false;
        try {
          const result = await createItem(formData);
          if (isUserError(result)) {
            refused.current = true;
            setError(result.error);
            return;
          }
          detailRef.current?.focus();
          router.refresh();
        } catch (e) {
          refused.current = true;
          setError(e instanceof Error ? e.message : "Couldn't add that item.");
        }
      }}
      className="space-y-2"
    >
      <ItemFields
        {...fieldProps}
        equipmentId={equipmentId}
        onEquipmentChange={setEquipmentId}
        detailRef={detailRef}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <SubmitButton label="Add item" />
    </form>
  );
}

function EditItemForm({
  item,
  fieldProps,
  onSubmit,
  onCancel,
}: {
  item: ItemWithEquipment;
  fieldProps: FieldProps;
  onSubmit: (formData: FormData) => Promise<void | UserError>;
  onCancel: () => void;
}) {
  const [equipmentId, setEquipmentId] = useState(item.equipmentId);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onReset={keepFormValues}
      action={async (formData) => {
        setError(null);
        try {
          const result = await onSubmit(formData);
          if (isUserError(result)) setError(result.error);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't save that item.");
        }
      }}
      className="space-y-2"
    >
      <ItemFields
        {...fieldProps}
        item={item}
        equipmentId={equipmentId}
        onEquipmentChange={setEquipmentId}
      />
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
  nested,
  equipmentOptions,
  equipmentCategories,
  moveOptions,
  canWrite,
  canDelete,
  canManageEquipment,
  createEquipment,
  supplyOrderTargets,
  addToSupplyOrder,
  createItem,
  updateItem,
  setArchived,
  moveItems,
  deleteItems,
}: Props) {
  const router = useRouter();
  const fieldProps = { equipmentOptions, equipmentCategories, canManageEquipment, createEquipment };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [showMove, setShowMove] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [orderTarget, setOrderTarget] = useState("");
  const [addResult, setAddResult] = useState<AddInventoryResult | null>(null);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const archivedCount = items.filter((i) => i.archived).length;
  const visible = showArchived ? items : items.filter((i) => !i.archived);

  const toggle = (id: string) => {
    // Starting a new selection retires the last result, so the banner can't
    // describe one set of items while a different set is checked.
    setAddResult(null);
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
    setShowOrder(false);
    setOrderTarget("");
    setConfirmingBulkDelete(false);
  };

  const run = (fn: () => Promise<void | UserError>) => {
    startTransition(async () => {
      setError(null);
      try {
        const result = await fn();
        if (isUserError(result)) {
          setError(result.error);
          return;
        }
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
            {supplyOrderTargets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOrder((v) => !v)}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Add to supply order…
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

          {showOrder && supplyOrderTargets.length > 0 && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {/* Grouped by event rather than a two-step event-then-order pair:
                  most people are looking for one order by name, and optgroup
                  gives the event context without a second control. */}
              <select
                value={orderTarget}
                onChange={(e) => setOrderTarget(e.target.value)}
                className="min-w-56 flex-1 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              >
                <option value="">— Select a supply order —</option>
                {supplyOrderTargets.map((target) => (
                  <optgroup key={target.eventId} label={target.eventName}>
                    {target.orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending || !orderTarget}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      setAddResult(await addToSupplyOrder(Array.from(selected), orderTarget));
                      clearSelection();
                      router.refresh();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Couldn't add those items.");
                    }
                  })
                }
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "..." : "Add"}
              </button>
            </div>
          )}
        </div>
      )}

      {addResult && (
        <div className="mb-3 p-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300">
          Added {addResult.added} item{addResult.added === 1 ? "" : "s"} to {addResult.orderName}.
          {addResult.skipped > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {" "}
              {addResult.skipped} no longer exist and were skipped.
            </span>
          )}
        </div>
      )}

      {nested.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Inside</h3>
          <div className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700">
            {nested.map((child) => (
              <Link
                key={child.id}
                href={`/storage-locations/locations/${child.id}`}
                className="flex items-baseline justify-between gap-2 p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <span className="min-w-0 flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {child.name}
                  </span>
                  {child.kind === "CONTAINER" && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {child.type ?? "Container"}
                    </span>
                  )}
                  {child.kind === "PLACE" && child.type && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{child.type}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {child.itemCount} item{child.itemCount === 1 ? "" : "s"}
                  {child.childCount > 0 && ` · ${child.childCount} inside`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          {nested.length > 0
            ? "No items filed directly here."
            : "Nothing recorded here yet."}
        </p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700">
          {visible.map((item) => (
            <div key={item.id} className="p-3">
              {editingId === item.id ? (
                <EditItemForm
                  item={item}
                  fieldProps={fieldProps}
                  onSubmit={async (formData) => {
                    const result = await updateItem(item.id, formData);
                    if (isUserError(result)) return result;
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
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {item.equipment.category}
                    </p>
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
          <AddItemForm fieldProps={fieldProps} createItem={createItem} />
        </div>
      )}
    </div>
  );
}
