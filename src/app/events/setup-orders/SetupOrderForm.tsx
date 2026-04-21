"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CustomOption } from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { VendorLinkControl, type VendorLinkEditProps } from "@/app/events/vendors/VendorLinkControl";
import { FunctionLinkControl, type FunctionLinkProps } from "@/app/events/functions/FunctionLinkControl";

type SetupOrderData = {
  id: string;
  description?: string | null;
  setupType?: string | null;
  notes?: string | null;
  roomId?: string | null;
  functionId?: string | null;
  function?: { id: string; name: string } | null;
  room?: { id: string; name: string } | null;
};

type SetupOrderFormProps = {
  setupOrder?: SetupOrderData | null;
  eventId: string;
  setupTypes: CustomOption[];
  action: (formData: FormData) => Promise<void>;
  functionLink?: FunctionLinkProps;
  vendorLink?: VendorLinkEditProps;
  availableVendors?: { id: string; label: string }[];
  rooms?: { id: string; name: string }[];
  functions?: { id: string; name: string; roomIds: string[] }[];
  initialRoomId?: string;
  initialFunctionId?: string;
  noCard?: boolean;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update Setup Order" : "Create Setup Order"}
    </button>
  );
}

export function SetupOrderForm({
  setupOrder,
  eventId,
  setupTypes,
  action,
  functionLink,
  vendorLink,
  availableVendors = [],
  rooms = [],
  functions = [],
  initialRoomId,
  initialFunctionId,
  noCard = false,
}: SetupOrderFormProps) {
  const isEdit = !!setupOrder;
  const [editing, setEditing] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(
    setupOrder?.roomId ?? initialRoomId ?? ""
  );

  const filteredFunctions = selectedRoomId
    ? functions.filter((f) => f.roomIds.includes(selectedRoomId))
    : functions;

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";

  if (isEdit && !editing) {
    return (
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Setup Order Details</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Room" value={setupOrder.room?.name ?? null} />
          <ReadOnlyField label="Setup Type" value={setupOrder.setupType ?? null} />
          <ReadOnlyField label="Description" value={setupOrder.description ?? null} />
          <ReadOnlyField label="Notes" value={setupOrder.notes ?? null} />
          {functionLink && <FunctionLinkControl {...functionLink} />}
          {vendorLink && <VendorLinkControl mode="edit" {...vendorLink} />}
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Setup Order Details
        </h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Room{!isEdit && <span className="text-red-500 ml-1">*</span>}
            </label>
            {rooms.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No rooms available. Add rooms to the event venue first.
              </p>
            ) : (
              <select
                id="roomId"
                name="roomId"
                required={!isEdit}
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select room —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>

          {!isEdit && (
            <div>
              <label htmlFor="functionId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Function <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="functionId"
                name="functionId"
                defaultValue={initialFunctionId ?? ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No function —</option>
                {filteredFunctions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              {selectedRoomId && filteredFunctions.length === 0 && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No functions assigned to this room.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="setupType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Setup Type
            </label>
            {setupTypes.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No setup types defined.{" "}
                <a href="/settings" className="text-blue-600 hover:underline">
                  Add setup types in Settings
                </a>
              </p>
            ) : (
              <select
                id="setupType"
                name="setupType"
                defaultValue={setupOrder?.setupType || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select setup type —</option>
                {setupTypes.map((t) => (
                  <option key={t.id} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={setupOrder?.description || ""}
              placeholder="Optional clarifying note for this setup"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={setupOrder?.notes || ""}
              placeholder="Additional setup notes or instructions..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {functionLink && (
            <FunctionLinkControl {...functionLink} />
          )}

          {isEdit && vendorLink ? (
            <VendorLinkControl mode="edit" {...vendorLink} />
          ) : !isEdit ? (
            <VendorLinkControl mode="create" availableVendors={availableVendors} />
          ) : null}
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
            href={`/events/${eventId}/setup-orders`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
