"use client";

import { useState } from "react";
import { btnPrimarySm } from "@/lib/buttonStyles";
import { useFormStatus } from "react-dom";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { computeServiceLocationCounts } from "@/lib/cateringServiceLocations";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type LocationFunction = {
  id: string;
  name: string;
  breakoutGroup: { name: string } | null;
  rooms?: { room: { id: string; name: string } }[];
};

type ServiceLocation = {
  id: string;
  name: string | null;
  functionId: string | null;
  expectedCount: number | null;
  notes: string | null;
  sortOrder: number;
  function: LocationFunction | null;
};

type FunctionOption = {
  id: string;
  name: string;
  breakoutGroup: { name: string } | null;
};

type Props = {
  locations: ServiceLocation[];
  orderExpectedCount: number | null;
  orderConfirmedCount: number | null;
  primaryFunctionName: string | null;
  primaryRoomName: string | null;
  functions: FunctionOption[];
  createLocation: (formData: FormData) => Promise<void>;
  updateLocation: (id: string, formData: FormData) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
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

function functionLabel(fn: FunctionOption | LocationFunction | null): string {
  if (!fn) return "";
  return formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name);
}

export function AdditionalServiceLocationTable({
  locations,
  orderExpectedCount,
  orderConfirmedCount,
  primaryFunctionName,
  primaryRoomName,
  functions,
  createLocation,
  updateLocation,
  deleteLocation,
}: Props) {
  const canWrite = useCanWrite("CATERING_ORDERS");
  const canDelete = useCanDelete("CATERING_ORDERS");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (formData: FormData) => {
    await createLocation(formData);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, formData: FormData) => {
    await updateLocation(id, formData);
    setEditingId(null);
  };

  const { sumKnown, uncountedCount, primaryRemaining, exceedsExpected, exceedsConfirmed } =
    computeServiceLocationCounts(locations, orderExpectedCount, orderConfirmedCount);

  const primaryName = primaryFunctionName ?? "Main Service";
  const hasWarnings = uncountedCount > 0 || exceedsExpected || exceedsConfirmed;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Service Locations</h2>
        {canWrite && (
          <button
            onClick={() => setShowAddForm(true)}
            className={btnPrimarySm}
          >
            Add Location
          </button>
        )}
      </div>

      {hasWarnings && (
        <div className="mb-3 text-xs space-y-1">
          {uncountedCount > 0 && (
            <div className="text-gray-500 dark:text-gray-400">
              ({uncountedCount} location count{uncountedCount === 1 ? "" : "s"} not yet set)
            </div>
          )}
          {exceedsExpected && orderExpectedCount != null && (
            <div className="text-amber-700 dark:text-amber-400">
              ⚠ Additional location counts ({sumKnown}) exceed order expected count ({orderExpectedCount}).
            </div>
          )}
          {exceedsConfirmed && orderConfirmedCount != null && (
            <div className="text-amber-700 dark:text-amber-400">
              ⚠ Additional location counts ({sumKnown}) also exceed confirmed count ({orderConfirmedCount}).
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <LocationForm
          mode="create"
          functions={functions}
          orderExpectedCount={orderExpectedCount}
          onSubmit={handleCreate}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="space-y-3">
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="text-sm">
            <span className="font-semibold text-gray-900 dark:text-white">{primaryName}</span>
            {primaryRoomName && (
              <span className="text-gray-500 dark:text-gray-400"> ({primaryRoomName})</span>
            )}
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Primary
            </span>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {orderExpectedCount != null && primaryRemaining != null
              ? `${primaryRemaining} of ${orderExpectedCount} expected`
              : "— of — expected"}
          </div>
        </div>

        {locations.map((loc) => {
          const derivedRoom = loc.function?.rooms?.[0]?.room.name ?? null;
          const functionName = loc.function ? functionLabel(loc.function) : null;
          const displayName = loc.name ?? functionName ?? "Unnamed location";
          const showFunctionAside = loc.name != null && functionName != null;
          return (
            <div key={loc.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === loc.id ? (
                <LocationForm
                  mode="edit"
                  initial={loc}
                  functions={functions}
                  orderExpectedCount={orderExpectedCount}
                  onSubmit={(fd) => handleUpdate(loc.id, fd)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-1">
                    <div className="text-sm">
                      <span className="font-semibold text-gray-900 dark:text-white">{displayName}</span>
                      {showFunctionAside ? (
                        <span className="text-gray-500 dark:text-gray-400">
                          {" · "}
                          {functionName}
                          {derivedRoom && ` (${derivedRoom})`}
                        </span>
                      ) : (
                        derivedRoom && (
                          <span className="text-gray-500 dark:text-gray-400"> ({derivedRoom})</span>
                        )
                      )}
                    </div>
                    <div className="flex gap-2 ml-2 shrink-0">
                      {canWrite && (
                        <button
                          onClick={() => setEditingId(loc.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (confirm("Delete this service location?")) await deleteLocation(loc.id);
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {loc.expectedCount != null && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {loc.expectedCount}
                      {orderExpectedCount != null ? ` of ${orderExpectedCount}` : ""} expected (part of order total)
                    </div>
                  )}
                  {loc.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{loc.notes}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type LocationFormProps = {
  mode: "create" | "edit";
  initial?: ServiceLocation;
  functions: FunctionOption[];
  orderExpectedCount: number | null;
  onSubmit: (formData: FormData) => Promise<void> | void;
  onCancel: () => void;
};

function LocationForm({
  mode,
  initial,
  functions,
  orderExpectedCount,
  onSubmit,
  onCancel,
}: LocationFormProps) {
  return (
    <form action={onSubmit} className={mode === "create" ? "mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3" : "space-y-3"}>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name <span className="text-gray-400 dark:text-gray-500 font-normal">(optional — defaults to the linked function name)</span>
        </label>
        <input
          type="text"
          name="name"
          defaultValue={initial?.name ?? ""}
          placeholder="e.g. Overflow Buffet"
          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Linked Function</label>
        <select
          name="functionId"
          defaultValue={initial?.functionId ?? "__blank__"}
          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="__blank__">(none)</option>
          {functions.map((fn) => (
            <option key={fn.id} value={fn.id}>
              {functionLabel(fn)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Expected at this location (part of order total — currently {orderExpectedCount ?? "—"})
        </label>
        <input
          type="number"
          name="expectedCount"
          min={0}
          defaultValue={initial?.expectedCount ?? ""}
          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
        <input
          type="text"
          name="notes"
          defaultValue={initial?.notes ?? ""}
          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
      </div>
      <div className="flex gap-2">
        <SubmitButton label={mode === "create" ? "Add" : "Save"} />
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
