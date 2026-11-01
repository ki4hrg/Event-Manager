"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type {
  AcquisitionState,
  Equipment,
  PackingStatus,
  SupplyOrderItem,
} from "@prisma/client";
import { FormSection } from "@/components/ui/FormSection";
import { GroupedEquipmentSelect } from "@/components/ui/GroupedEquipmentSelect";
import { LocationSelect, type LocationOption } from "@/components/ui/LocationSelect";
import { PackingSubstatusSelect, type PackingSubstatusOption } from "@/components/ui/PackingSubstatusSelect";
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
import { InlineConfirmButton } from "@/components/InlineConfirmButton";
import { isUserError, type UserError, actionErrorMessage } from "@/lib/userErrors";

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
  createItem: (formData: FormData) => Promise<void | UserError>;
  updateItem: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteItem: (id: string) => Promise<void>;
  packingSubstatusOptions: PackingSubstatusOption[];
  updateItemPackingStatus: (id: string, packingStatus: PackingStatus, packingSubstatus?: string | null) => Promise<void>;
  updateItemAcquisitionState: (id: string, acquisitionState: AcquisitionState) => Promise<void>;
  createContainer: (name: string, parentId: string | null, type: string | null) => Promise<string | UserError>;
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
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
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
  createContainer: (name: string, parentId: string | null, type: string | null) => Promise<string | UserError>;
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
                if (isUserError(id)) {
                  setError(id.error);
                  return;
                }
                onCreated(id);
                setOpen(false);
                setName("");
              } catch (e) {
                setError(actionErrorMessage(e, "Couldn't create that container."));
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
  packingSubstatusOptions,
  onSubmit,
  onDone,
  onCancel,
  submitLabel,
}: {
  item?: ItemWithExtras;
  equipmentOptions: Equipment[];
  locationOptions: LocationOption[];
  containerOptions: LocationOption[];
  locationTypes: { id: string; label: string }[];
  canManageLocations: boolean;
  createContainer: (name: string, parentId: string | null, type: string | null) => Promise<string | UserError>;
  pool: ResponsiblePartyPool;
  packingSubstatusOptions: PackingSubstatusOption[];
  onSubmit: (formData: FormData) => Promise<void | UserError>;
  onDone: () => void;
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
  const [packingStatus, setPackingStatus] = useState<PackingStatus>(item?.packingStatus ?? "NEEDED");

  return (
    <ActionForm action={onSubmit} onDone={onDone} className="space-y-3">
      <div className="space-y-3">
        <FormSection title="Item">
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={isContainer}
                onChange={(e) => setIsContainer(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              This is a container
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
                placeholder="— Select —"
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
                  ? "Defaults to container name"
                  : "e.g. Printer"
              }
              className={inputClass}
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
        </FormSection>
        <FormSection title="Sourcing">
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
        </FormSection>
        <FormSection title="Packing">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {isContainer ? "Sits on (this event)" : "Storage location"}
            </label>
            <LocationSelect
              name="sourceLocationId"
              options={locationOptions}
              value={sourceId}
              onChange={setSourceId}
              placeholder={isContainer ? "— Usual spot —" : "— None —"}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Packing Status</label>
            <select
              name="packingStatus"
              value={packingStatus}
              onChange={(e) => setPackingStatus(e.target.value as PackingStatus)}
              className={inputClass}
            >
              {PACKING_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <PackingSubstatusSelect
              key={packingStatus}
              name="packingSubstatus"
              status={packingStatus}
              options={packingSubstatusOptions}
              defaultValue={packingStatus === item?.packingStatus ? item.packingSubstatus : null}
              className={`${inputClass} mt-2`}
            />
          </div>
        </FormSection>
        <FormSection>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <input
              type="text"
              name="notes"
              defaultValue={item?.notes ?? ""}
              placeholder="Notes..."
              className={inputClass}
            />
          </div>
        </FormSection>
      </div>
      <ActionFormError />
      <div className="flex gap-2">
        <SubmitButton label={submitLabel} />
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}

function PackingStatusToggle({
  itemId,
  current,
  currentSubstatus,
  substatusOptions,
  onChange,
}: {
  itemId: string;
  current: PackingStatus;
  currentSubstatus: string | null;
  substatusOptions: PackingSubstatusOption[];
  onChange: (id: string, status: PackingStatus, substatus?: string | null) => Promise<void>;
}) {
  const canWrite = useCanWrite("SUPPLY_ORDERS");
  const [isPending, startTransition] = useTransition();
  return (
    <>
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
      <PackingSubstatusSelect
        status={current}
        options={substatusOptions}
        value={currentSubstatus}
        disabled={isPending || !canWrite}
        onChange={(substatus) =>
          startTransition(async () => {
            await onChange(itemId, current, substatus);
          })
        }
        className="text-xs px-1.5 py-0.5"
      />
    </>
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
        setError(actionErrorMessage(e, "Couldn't read this container's contents."));
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
            ? "No items from this container."
            : `${total} item${total === 1 ? "" : "s"} inside.`}
          {blocked > 0 && (
            <span className="block text-amber-700 dark:text-amber-300 text-xs mt-1">
              {blocked} more on orders you can&apos;t edit (skipped).
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
                    setError(actionErrorMessage(e, "Couldn't update the contents."));
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
  packingSubstatusOptions,
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
    packingSubstatusOptions,
  };


  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Supply Items</h2>
        <div className="flex flex-wrap items-center gap-3">
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
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
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
            onSubmit={createItem}
            onDone={() => setShowAddForm(false)}
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
                      onSubmit={(fd) => updateItem(item.id, fd)}
                      onDone={() => setEditingId(null)}
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
                          currentSubstatus={item.packingSubstatus}
                          substatusOptions={packingSubstatusOptions}
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
                          {item.containerLocation ? "Sits on" : "Storage"}: {item.sourceLocation.name}
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
                          <InlineConfirmButton
                            onConfirm={() => deleteItem(item.id)}
                            resource="SUPPLY_ORDERS"
                            requiredLevel="WRITE"
                            className="text-red-600 dark:text-red-400 hover:underline text-xs"
                          />
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
                      onSubmit={(fd) => updateItem(item.id, fd)}
                      onDone={() => setEditingId(null)}
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
                            currentSubstatus={item.packingSubstatus}
                            substatusOptions={packingSubstatusOptions}
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
                              {item.containerLocation ? "Sits on" : "Storage"}: {item.sourceLocation.name}
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
                          <InlineConfirmButton
                            onConfirm={() => deleteItem(item.id)}
                            resource="SUPPLY_ORDERS"
                            requiredLevel="WRITE"
                            className="text-red-600 dark:text-red-400 hover:underline text-sm"
                          />
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
