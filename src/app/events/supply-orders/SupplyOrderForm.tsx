"use client";

import { useMemo, useState } from "react";
import { btnPrimary } from "@/lib/buttonStyles";
import { useFormStatus } from "react-dom";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { PartyField } from "@/app/events/av-orders/party-field";
import { partyLabel } from "@/lib/partyLabel";
import type { ResponsiblePartyPool } from "@/lib/responsibleParties";
import { groupRoomsByGroup } from "@/lib/roomGroups";
import { useCanWrite } from "@/components/PermissionsProvider";

type SupplyOrderData = {
  id: string;
  name: string;
  roomId?: string | null;
  room?: { id: string; name: string } | null;
  specificLocation?: string | null;
  notes?: string | null;
  providerVendorId?: string | null;
  providerContactId?: string | null;
  providerVendor?: { name: string } | null;
  providerContact?: { firstName: string; lastName: string } | null;
};

type SupplyOrderFormProps = {
  supplyOrder?: SupplyOrderData | null;
  eventId: string;
  rooms: { id: string; name: string; group?: { id: string; name: string; sortOrder: number } | null }[];
  pool: ResponsiblePartyPool;
  action: (formData: FormData) => Promise<void>;
  initialRoomId?: string;
  cancelPath?: string;
  defaultName?: string;
  noCard?: boolean;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimary} disabled:opacity-50`}
    >
      {pending ? "Saving..." : isEdit ? "Update Supply Order" : "Create Supply Order"}
    </button>
  );
}

export function SupplyOrderForm({
  supplyOrder,
  eventId,
  rooms,
  pool,
  action,
  initialRoomId,
  cancelPath,
  defaultName,
  noCard = false,
}: SupplyOrderFormProps) {
  const isEdit = !!supplyOrder;
  // Read-only users get the detail view with no way back into edit mode.
  const canWrite = useCanWrite("SUPPLY_ORDERS");
  const [editing, setEditing] = useState(false);

  const roomBuckets = useMemo(() => groupRoomsByGroup(rooms), [rooms]);
  const hasRoomGroups = roomBuckets.some((b) => b.groupId !== null);

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";

  if (isEdit && (!editing || !canWrite)) {
    return (
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Supply Order Details</h2>
          {canWrite && (
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Name" value={supplyOrder.name} />
          <ReadOnlyField label="Destination Room" value={supplyOrder.room?.name ?? null} />
          <ReadOnlyField label="Specific Location" value={supplyOrder.specificLocation ?? null} />
          <ReadOnlyField
            label="Provider"
            value={partyLabel(supplyOrder.providerVendor, supplyOrder.providerContact)}
          />
          <ReadOnlyField label="Notes" value={supplyOrder.notes ?? null} />
        </dl>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
    >
      <div className={cardClass}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Supply Order Details</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              id="name"
              type="text"
              name="name"
              required
              defaultValue={supplyOrder?.name ?? defaultName ?? ""}
              placeholder="e.g. Registration Kit"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Destination Room
            </label>
            {rooms.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No rooms available. Add rooms to the event venue first.
              </p>
            ) : (
              <select
                id="roomId"
                name="roomId"
                defaultValue={supplyOrder?.roomId ?? initialRoomId ?? ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No room —</option>
                {hasRoomGroups
                  ? roomBuckets.map((bucket) => (
                      <optgroup key={bucket.key} label={bucket.label}>
                        {bucket.rooms.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </optgroup>
                    ))
                  : rooms.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="specificLocation" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Specific Location
            </label>
            <input
              id="specificLocation"
              type="text"
              name="specificLocation"
              defaultValue={supplyOrder?.specificLocation ?? ""}
              placeholder="e.g. Near the registration table"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
            <PartyField
              fieldPrefix="provider"
              vendorGroups={pool.vendorGroups}
              contacts={pool.contacts}
              defaultVendorId={supplyOrder?.providerVendorId ?? null}
              defaultContactId={supplyOrder?.providerContactId ?? null}
            />
            {!isEdit && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Defaults to the event-team / event-default vendor if left blank. Items inherit this unless overridden.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={supplyOrder?.notes ?? ""}
              placeholder="Additional notes or instructions..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4 mt-6">
        <SubmitButton isEdit={isEdit} />
        {isEdit ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        ) : (
          <a
            href={cancelPath ?? `/events/${eventId}/supply-orders`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
