"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { Function, Room, AVNeeds, BEODetails, FunctionRoom, FunctionType } from "@prisma/client";

type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
  avNeeds: AVNeeds | null;
  beoDetails: BEODetails | null;
};

type FunctionFormProps = {
  fn?: FunctionWithRelations;
  rooms: Room[];
  eventId: string;
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

const functionTypes = [
  { value: "GENERAL", label: "General" },
  { value: "MEAL", label: "Meal / BEO" },
  { value: "BREAKOUT", label: "Breakout Session" },
  { value: "PLENARY", label: "Plenary Session" },
];

export function FunctionForm({ fn, rooms, eventId, action }: FunctionFormProps) {
  const isEdit = !!fn;
  const [selectedType, setSelectedType] = useState<FunctionType>(fn?.type || "GENERAL");

  const formatDateForInput = (date: Date) => {
    return new Date(date).toISOString().split("T")[0];
  };

  const formatTimeForInput = (date: Date) => {
    const d = new Date(date);
    const hours = d.getUTCHours().toString().padStart(2, "0");
    const minutes = d.getUTCMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const selectedRoomIds = fn?.rooms.map((r) => r.roomId) || [];

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
              Type *
            </label>
            <select
              id="type"
              name="type"
              required
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as FunctionType)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {functionTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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

      {/* Schedule */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Schedule
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Date *
            </label>
            <input
              type="date"
              id="date"
              name="date"
              required
              defaultValue={fn ? formatDateForInput(fn.date) : ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="startTime"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Start Time *
            </label>
            <input
              type="time"
              id="startTime"
              name="startTime"
              required
              defaultValue={fn ? formatTimeForInput(fn.startTime) : ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="endTime"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              End Time *
            </label>
            <input
              type="time"
              id="endTime"
              name="endTime"
              required
              defaultValue={fn ? formatTimeForInput(fn.endTime) : ""}
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { name: "projector", label: "Projector" },
            { name: "screen", label: "Screen" },
            { name: "microphone", label: "Microphone" },
            { name: "podium", label: "Podium" },
            { name: "webcast", label: "Webcast" },
            { name: "recording", label: "Recording" },
            { name: "videoPlayback", label: "Video Playback" },
          ].map((item) => (
            <label key={item.name} className="flex items-center space-x-2">
              <input
                type="checkbox"
                name={`av_${item.name}`}
                defaultChecked={fn?.avNeeds?.[item.name as keyof AVNeeds] === true}
                className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-900 dark:text-white">{item.label}</span>
            </label>
          ))}
        </div>

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

      {/* BEO Details (only for MEAL type) */}
      {selectedType === "MEAL" && (
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
