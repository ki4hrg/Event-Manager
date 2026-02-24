"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { Function, Room, AVNeeds, BEODetails, FunctionRoom, CustomOption } from "@prisma/client";

type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
  avNeeds: AVNeeds | null;
  beoDetails: BEODetails | null;
};

type FunctionFormProps = {
  fn?: FunctionWithRelations;
  rooms: Room[];
  eventId: string;
  functionTypes: CustomOption[];
  avEquipment: CustomOption[];
  action: (formData: FormData) => Promise<void>;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update Function" : "Create Function"}
    </button>
  );
}

export function FunctionForm({ fn, rooms, eventId, functionTypes, avEquipment, action }: FunctionFormProps) {
  const isEdit = !!fn;
  const [selectedType, setSelectedType] = useState(fn?.type || functionTypes[0]?.value || "");

  // Find the type that shows BEO details (check for "meal" in label or value)
  const mealTypeValues = functionTypes
    .filter((t) => t.label.toLowerCase().includes("meal") || t.value.toLowerCase().includes("meal"))
    .map((t) => t.value);

  const selectedRoomIds = fn?.rooms.map((r) => r.roomId) || [];
  const selectedEquipment = fn?.avNeeds?.equipment || [];

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {/* Basic Info */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Basic Information
        </h2>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Function Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={fn?.name}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Type
            </label>
            {functionTypes.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No function types defined.{" "}
                <a href="/settings" className="text-blue-600 hover:underline">
                  Add types in Settings
                </a>
              </p>
            ) : (
              <select
                id="type"
                name="type"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type...</option>
                {functionTypes.map((t) => (
                  <option key={t.id} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={fn?.description || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Room Assignment */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Room Assignment
        </h2>

        {rooms.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">
            No rooms available. Add rooms to the event&apos;s venue first.
          </p>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <label key={room.id} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="roomIds"
                  value={room.id}
                  defaultChecked={selectedRoomIds.includes(room.id)}
                  className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-900 dark:text-white">{room.name}</span>
                {room.capacity && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    (capacity: {room.capacity})
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Setup Notes */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Setup Notes
        </h2>

        <textarea
          id="setupNotes"
          name="setupNotes"
          rows={3}
          placeholder="Table setup, seating arrangement, special requirements..."
          defaultValue={fn?.setupNotes || ""}
          className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* AV Requirements */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          AV Requirements
        </h2>

        {avEquipment.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No AV equipment options defined.{" "}
            <a href="/settings" className="text-blue-600 hover:underline">
              Add equipment in Settings
            </a>
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {avEquipment.map((item) => (
              <label key={item.id} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="equipment"
                  value={item.value}
                  defaultChecked={selectedEquipment.includes(item.value)}
                  className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-900 dark:text-white">{item.label}</span>
              </label>
            ))}
          </div>
        )}

        <div>
          <label
            htmlFor="av_notes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            AV Notes
          </label>
          <textarea
            id="av_notes"
            name="av_notes"
            rows={2}
            placeholder="Additional AV requirements or notes..."
            defaultValue={fn?.avNeeds?.notes || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* BEO Details (only for meal-type functions) */}
      {mealTypeValues.includes(selectedType) && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Banquet Event Order (BEO) Details
          </h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="beo_guaranteeCount"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Guarantee Count
                </label>
                <input
                  type="number"
                  id="beo_guaranteeCount"
                  name="beo_guaranteeCount"
                  defaultValue={fn?.beoDetails?.guaranteeCount || ""}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="beo_tableSetup"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Table Setup
                </label>
                <input
                  type="text"
                  id="beo_tableSetup"
                  name="beo_tableSetup"
                  placeholder="e.g., Rounds of 10, Classroom style"
                  defaultValue={fn?.beoDetails?.tableSetup || ""}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="beo_menuNotes"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Menu Notes
              </label>
              <textarea
                id="beo_menuNotes"
                name="beo_menuNotes"
                rows={2}
                defaultValue={fn?.beoDetails?.menuNotes || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="beo_dietaryNotes"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Dietary Requirements
              </label>
              <textarea
                id="beo_dietaryNotes"
                name="beo_dietaryNotes"
                rows={2}
                placeholder="Vegetarian, vegan, gluten-free, allergies..."
                defaultValue={fn?.beoDetails?.dietaryNotes || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="beo_beverageNotes"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Beverage Notes
              </label>
              <textarea
                id="beo_beverageNotes"
                name="beo_beverageNotes"
                rows={2}
                defaultValue={fn?.beoDetails?.beverageNotes || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="beo_notes"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Additional BEO Notes
              </label>
              <textarea
                id="beo_notes"
                name="beo_notes"
                rows={2}
                defaultValue={fn?.beoDetails?.notes || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        <a
          href={`/events/${eventId}`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
