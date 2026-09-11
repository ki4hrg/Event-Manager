"use client";

import { useState, useTransition } from "react";
import { btnPrimarySm } from "@/lib/buttonStyles";
import { useFormStatus } from "react-dom";
import type {
  AcquisitionState,
  Equipment,
  PackingStatus,
  SupplyOrderItem,
} from "@prisma/client";
import { GroupedEquipmentSelect } from "@/components/ui/GroupedEquipmentSelect";
import { LocationSelect, type LocationOption } from "@/components/ui/LocationSelect";
import { PartyField } from "@/app/events/av-orders/party-field";
import { partyLabel } from "@/lib/partyLabel";
import type { ResponsiblePartyPool } from "@/lib/responsibleParties";
import {
  ACQUISITION_LABEL,
  ACQUISITION_OPTIONS,
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
  PACKING_STATUS_OPTIONS,
} from "@/lib/statusConstants";
import { PackingProcurementWarning } from "@/components/PackingProcurementWarning";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type ItemWithExtras = SupplyOrderItem & {
  equipment: Equipment | null;
  sourceLocation: { id: string; name: string } | null;
  containerLocation: { id: string; name: string; type: string | null } | null;
  providerVendor: { id: string; name: string } | null;
  providerContact: { id: string; firstName: string; lastName: string } | null;
};

export type ContainerCascadeCounts = {
  containerName: string;
  supplyCount: number;
  printCount: number;
  blockedSupplyCount: number;
  blockedPrintCount: number;
};

type OrderProvider = {
  providerVendor?: { name: string } | null;
  providerContact?: { firstName: string; lastName: string } | null;
};

type SupplyOrderItemPanelProps = {
  items: ItemWithExtras[];
  equipmentOptions: Equipment[];
  allEquipmentOptions?: Equipment[];
  /** Places plus the containers this order owns — the everyday choice. */
  locationOptions: LocationOption[];
  /** Every non-archived location, revealed by "Show all containers". */
  allLocationOptions: LocationOption[];
  /** Containers, for the picker that says which container a line *is*. Never
   *  scoped to one order: a pallet carries boxes from several orders. */
  containerOptions: LocationOption[];
  locationTypes: { id: string; label: string }[];
  canManageLocations: boolean;
  pool: ResponsiblePartyPool;
  orderProvider: OrderProvider;
  createItem: (formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateItemPackingStatus: (id: string, packingStatus: PackingStatus) => Promise<void>;
  updateItemAcquisitionState: (id: string, acquisitionState: AcquisitionState) => Promise<void>;
  createContainer: (name: string, parentId: string | null, type: string | null) => Promise<string>;
  previewContainerCascade: (containerLocationId: string) => Promise<ContainerCascadeCounts>;
  markContainerContents: (
    containerLocationId: string,
    packingStatus: PackingStatus,
  ) => Promise<{ supplyUpdated: number; printUpdated: number }>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimarySm} disabled:opacity-50`}
    >
      {pending ? "..." : label}
    </button>
  );
}

function InlineContainerCreate({
  locationTypes,
  parentOptions,
  createContainer,
  onCreated,
}: {
  locationTypes: { id: string; label: string }[];
  parentOptions: LocationOption[];
  createContainer: (name: string, parentId: string | null, type: string | null) => Promise<string>;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputClass =
    "w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        ＋ New container
      </button>
    );
  }

  return (
    <div className="mt-2 p-2 rounded border border-gray-200 dark:border-gray-700 space-y-2">
      <input
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Registration Box"
        className={inputClass}
      />
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          <option value="">— Type —</option>
          {locationTypes.map((t) => (
            <option key={t.id} value={t.label}>
              {t.label}
            </option>
          ))}
        </select>
        <LocationSelect
          options={parentOptions}
          value={parentId}
          onChange={setParentId}
          placeholder="— Top level —"
        />
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const id = await createContainer(name.trim(), parentId || null, type || null);
                onCreated(id);
                setOpen(false);
                setName("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't create that container.");
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

function ItemForm({
  item,
  equipmentOptions,
  locationOptions,
  containerOptions,
  locationTypes,
  canManageLocations,
  createContainer,
  pool,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item?: ItemWithExtras;
  equipmentOptions: Equipment[];
  locationOptions: LocationOption[];
  containerOptions: LocationOption[];
  locationTypes: { id: string; label: string }[];
  canManageLocations: boolean;
  createContainer: (name: string, parentId: string | null, type: string | null) => Promise<string>;
  pool: ResponsiblePartyPool;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const inputClass =
    "w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

  // Controlled because the form mediates selection across a UI transition:
  // toggling "is a container" swaps which picker is mounted, and creating a
  // container inline has to select the option that didn't exist a moment ago.
  const [isContainer, setIsContainer] = useState(!!item?.containerLocationId);
  const [containerId, setContainerId] = useState(item?.containerLocationId ?? "");
  const [sourceId, setSourceId] = useState(item?.sourceLocationId ?? "");

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={isContainer}
              onChange={(e) => setIsContainer(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            This line is a container being shipped (a box, a pallet)
          </label>
        </div>

        {isContainer && (
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Which container <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <LocationSelect
              name="containerLocationId"
              options={containerOptions}
              value={containerId}
              onChange={setContainerId}
              placeholder="— Select a container —"
            />
            {canManageLocations && (
              <InlineContainerCreate
                locationTypes={locationTypes}
                parentOptions={locationOptions}
                createContainer={createContainer}
                onCreated={setContainerId}
              />
            )}
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            name="description"
            defaultValue={item?.description ?? ""}
            placeholder={
              isContainer
                ? "Optional — the container's name is used when blank"
                : "e.g. Printer (optional if Equipment is selected)"
            }
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            {isContainer ? "Sits on (this event)" : "Comes from"}
          </label>
          <LocationSelect
            name="sourceLocationId"
            options={locationOptions}
            value={sourceId}
            onChange={setSourceId}
            placeholder={isContainer ? "— Its usual spot —" : "— None —"}
          />
        </div>
        {!isContainer && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Equipment (optional)</label>
            <GroupedEquipmentSelect
              options={equipmentOptions}
              defaultValue={item?.equipmentId ?? null}
              size="sm"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
          <input
            type="number"
            name="quantity"
            min={1}
            defaultValue={item?.quantity ?? ""}
            placeholder="e.g. 1"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Acquisition State</label>
          <select
            name="acquisitionState"
            defaultValue={item?.acquisitionState ?? "ON_HAND"}
            className={inputClass}
          >
            {ACQUISITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Provider (override)
          </label>
          <PartyField
            fieldPrefix="provider"
            vendorGroups={pool.vendorGroups}
            contacts={pool.contacts}
            defaultVendorId={item?.providerVendorId ?? null}
            defaultContactId={item?.providerContactId ?? null}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Packing Status</label>
          <select
            name="packingStatus"
            defaultValue={item?.packingStatus ?? "NEEDED"}
            className={inputClass}
          >
            {PACKING_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <input
            type="text"
            name="notes"
            defaultValue={item?.notes ?? ""}
            placeholder="Additional notes..."
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton label={submitLabel} />
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function PackingStatusToggle({
  itemId,
  current,
  onChange,
}: {
  itemId: string;
  current: PackingStatus;
  onChange: (id: string, status: PackingStatus) => Promise<void>;
}) {
  const canWrite = useCanWrite("SUPPLY_ORDERS");
  const [isPending, startTransition] = useTransition();
  return (
    <select
      value={current}
      disabled={isPending || !canWrite}
      onChange={(e) => {
        const next = e.target.value as PackingStatus;
        startTransition(async () => {
          await onChange(itemId, next);
        });
      }}
      className={`text-xs rounded px-2 py-0.5 border-0 font-medium disabled:opacity-50 ${PACKING_STATUS_CLASS[current]}`}
    >
      {PACKING_STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/**
 * "Also mark contents" on a container line. Deliberately a separate verb from
 * the row's own packing toggle: the container's status is the box's status, and
 * pushing it onto the contents is something you ask for, not a side effect.
 */
function ContainerContentsAction({
  containerLocationId,
  preview,
  apply,
}: {
  containerLocationId: string;
  preview: (containerLocationId: string) => Promise<ContainerCascadeCounts>;
  apply: (
    containerLocationId: string,
    packingStatus: PackingStatus,
  ) => Promise<{ supplyUpdated: number; printUpdated: number }>;
}) {
  const canWrite = useCanWrite("SUPPLY_ORDERS");
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<ContainerCascadeCounts | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openPanel = () => {
    setOpen(true);
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        setCounts(await preview(containerLocationId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read this container's contents.");
      }
    });
  };

  if (!canWrite) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        Mark contents…
      </button>
    );
  }

  const total = (counts?.supplyCount ?? 0) + (counts?.printCount ?? 0);
  const blocked = (counts?.blockedSupplyCount ?? 0) + (counts?.blockedPrintCount ?? 0);

  return (
    <div className="mt-1 p-2 rounded border border-gray-200 dark:border-gray-700 text-xs">
      {error ? (
        <p className="text-red-600 dark:text-red-400">{error}</p>
      ) : result ? (
        <p className="text-gray-700 dark:text-gray-300">{result}</p>
      ) : counts ? (
        <p className="text-gray-700 dark:text-gray-300">
          {total === 0
            ? "Nothing is sourced from this container yet."
            : `Marks ${total} item${total === 1 ? "" : "s"} inside this container.`}
          {blocked > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {" "}
              {blocked} more {blocked === 1 ? "is" : "are"} on orders you can&apos;t edit and will
              be left alone.
            </span>
          )}
        </p>
      ) : (
        <p className="text-gray-500 dark:text-gray-400">Counting…</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {!result &&
          total > 0 &&
          PACKING_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    const applied = await apply(containerLocationId, option.value);
                    const n = applied.supplyUpdated + applied.printUpdated;
                    setResult(
                      `Marked ${n} item${n === 1 ? "" : "s"} ${PACKING_STATUS_LABEL[
                        option.value
                      ].toLowerCase()}.`,
                    );
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Couldn't update the contents.");
                  }
                })
              }
              className={`px-2 py-0.5 rounded font-medium disabled:opacity-50 ${PACKING_STATUS_CLASS[option.value]}`}
            >
              {option.label}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-2 py-0.5 text-gray-600 dark:text-gray-400"
        >
          {result ? "Done" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

// Resolves the visible provider for an item: own value first, then fall back
// to the order's provider with a `(from order)` annotation.
function resolveProvider(item: ItemWithExtras, order: OrderProvider): { label: string; inherited: boolean } | null {
  const own = partyLabel(item.providerVendor, item.providerContact);
  if (own) return { label: own, inherited: false };
  const inherited = partyLabel(order.providerVendor, order.providerContact);
  if (inherited) return { label: inherited, inherited: true };
  return null;
}

/** Container lines carry their identity in the container, not a description. */
function itemTitle(item: ItemWithExtras): string {
  return (
    item.description ??
    item.containerLocation?.name ??
    item.equipment?.name ??
    "Untitled item"
  );
}

export function SupplyOrderItemPanel({
  items,
  equipmentOptions,
  allEquipmentOptions,
  locationOptions,
  allLocationOptions,
  containerOptions,
  locationTypes,
  canManageLocations,
  pool,
  orderProvider,
  createItem,
  updateItem,
  deleteItem,
  updateItemPackingStatus,
  updateItemAcquisitionState,
  createContainer,
  previewContainerCascade,
  markContainerContents,
}: SupplyOrderItemPanelProps) {
  const canWrite = useCanWrite("SUPPLY_ORDERS");
  const canDelete = useCanDelete("SUPPLY_ORDERS");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showAllLocations, setShowAllLocations] = useState(false);

  const hasFilter = !!allEquipmentOptions;
  const activeEquipmentOptions = hasFilter && showAll ? allEquipmentOptions! : equipmentOptions;
  // Same scoping idiom as equipment: the everyday set by default, everything
  // behind a toggle for the box that serves more than one destination.
  const activeLocationOptions = showAllLocations ? allLocationOptions : locationOptions;

  const formProps = {
    equipmentOptions: activeEquipmentOptions,
    locationOptions: activeLocationOptions,
    containerOptions,
    locationTypes,
    canManageLocations,
    createContainer,
    pool,
  };

  const handleCreate = async (formData: FormData) => {
    await createItem(formData);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, formData: FormData) => {
    await updateItem(id, formData);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Supply Items</h2>
        <div className="flex items-center gap-3">
          {hasFilter && (
            <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show all equipment
            </label>
          )}
          {allLocationOptions.length > locationOptions.length && (
            <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllLocations}
                onChange={(e) => setShowAllLocations(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show all containers
            </label>
          )}
          {!showAddForm && canWrite && (
            <button
              onClick={() => setShowAddForm(true)}
              className={btnPrimarySm}
            >
              Add Item
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <ItemForm
            {...formProps}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add"
          />
        </div>
      )}

      {items.length === 0 && !showAddForm ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No supply items yet.</p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            {items.map((item) => {
              const provider = resolveProvider(item, orderProvider);
              return (
                <div key={item.id} className="p-3">
                  {editingId === item.id ? (
                    <ItemForm
                      item={item}
                      {...formProps}
                      onSubmit={(fd) => handleUpdate(item.id, fd)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Save"
                    />
                  ) : (
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {itemTitle(item)}
                        </span>
                        {item.containerLocation && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {item.containerLocation.type ?? "Container"}
                          </span>
                        )}
                        {item.quantity && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">× {item.quantity}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <PackingStatusToggle
                          itemId={item.id}
                          current={item.packingStatus}
                          onChange={updateItemPackingStatus}
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {ACQUISITION_LABEL[item.acquisitionState]}
                        </span>
                      </div>
                      <div className="mt-1">
                        <PackingProcurementWarning
                          packingStatus={item.packingStatus}
                          acquisitionState={item.acquisitionState}
                          onFix={() => updateItemAcquisitionState(item.id, "ON_HAND")}
                        />
                      </div>
                      {provider && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Provider: {provider.label}
                          {provider.inherited && (
                            <span className="ml-1 italic text-gray-400 dark:text-gray-500">(from order)</span>
                          )}
                        </p>
                      )}
                      {item.equipment && item.description && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {item.equipment.category} · {item.equipment.name}
                        </p>
                      )}
                      {item.sourceLocation && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {item.containerLocation ? "Sits on" : "From"}: {item.sourceLocation.name}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-0.5 text-xs italic text-gray-400 dark:text-gray-500">{item.notes}</p>
                      )}
                      {item.containerLocation && (
                        <div className="mt-1">
                          <ContainerContentsAction
                            containerLocationId={item.containerLocation.id}
                            preview={previewContainerCascade}
                            apply={markContainerContents}
                          />
                        </div>
                      )}
                      <div className="mt-2 flex gap-3">
                        {canWrite && (
                          <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={async () => {
                              if (confirm("Delete this item?")) await deleteItem(item.id);
                            }}
                            className="text-red-600 hover:underline text-xs"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block space-y-2">
            {items.map((item) => {
              const provider = resolveProvider(item, orderProvider);
              return (
                <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  {editingId === item.id ? (
                    <ItemForm
                      item={item}
                      {...formProps}
                      onSubmit={(fd) => handleUpdate(item.id, fd)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Save"
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {itemTitle(item)}
                          </span>
                          {item.containerLocation && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              {item.containerLocation.type ?? "Container"}
                            </span>
                          )}
                          {item.quantity && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">× {item.quantity}</span>
                          )}
                          <PackingStatusToggle
                            itemId={item.id}
                            current={item.packingStatus}
                            onChange={updateItemPackingStatus}
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {ACQUISITION_LABEL[item.acquisitionState]}
                          </span>
                          <PackingProcurementWarning
                            packingStatus={item.packingStatus}
                            acquisitionState={item.acquisitionState}
                            onFix={() => updateItemAcquisitionState(item.id, "ON_HAND")}
                          />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                          {item.equipment && item.description && (
                            <span>
                              {item.equipment.category} · {item.equipment.name}
                            </span>
                          )}
                          {provider && (
                            <span>
                              Provider: {provider.label}
                              {provider.inherited && (
                                <span className="ml-1 italic text-gray-400 dark:text-gray-500">(from order)</span>
                              )}
                            </span>
                          )}
                          {item.sourceLocation && (
                            <span>
                              {item.containerLocation ? "Sits on" : "From"}: {item.sourceLocation.name}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-xs italic text-gray-400 dark:text-gray-500 mt-0.5">{item.notes}</p>
                        )}
                        {item.containerLocation && (
                          <div className="mt-1">
                            <ContainerContentsAction
                              containerLocationId={item.containerLocation.id}
                              preview={previewContainerCascade}
                              apply={markContainerContents}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {canWrite && (
                          <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={async () => {
                              if (confirm("Delete this item?")) await deleteItem(item.id);
                            }}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Re-export label so other components can describe a packed badge consistently.
export { PACKING_STATUS_LABEL };
