"use client";

import { useFormStatus } from "react-dom";
import type { Presentation, PresentationAVNeeds, CustomOption } from "@prisma/client";

type PresentationWithAV = Presentation & {
  avNeeds: PresentationAVNeeds | null;
};

type PresentationFormProps = {
  presentation?: PresentationWithAV;
  eventId: string;
  tracks: CustomOption[];
  levels: CustomOption[];
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
      {pending ? "Saving..." : isEdit ? "Update Presentation" : "Create Presentation"}
    </button>
  );
}

export function PresentationForm({
  presentation,
  eventId,
  tracks,
  levels,
  avEquipment,
  action,
}: PresentationFormProps) {
  const isEdit = !!presentation;
  const selectedEquipment = presentation?.avNeeds?.equipment || [];

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {/* Basic Info */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Presentation Details
        </h2>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              defaultValue={presentation?.title}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="abstract"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Abstract
            </label>
            <textarea
              id="abstract"
              name="abstract"
              rows={4}
              defaultValue={presentation?.abstract || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="duration"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Duration (minutes)
              </label>
              <input
                type="number"
                id="duration"
                name="duration"
                min="1"
                defaultValue={presentation?.duration || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="track"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Track
              </label>
              {tracks.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No tracks defined.{" "}
                  <a href="/settings" className="text-blue-600 hover:underline">
                    Add tracks in Settings
                  </a>
                </p>
              ) : (
                <select
                  id="track"
                  name="track"
                  defaultValue={presentation?.track || ""}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select track...</option>
                  {tracks.map((t) => (
                    <option key={t.id} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label
                htmlFor="level"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Level
              </label>
              {levels.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No levels defined.{" "}
                  <a href="/settings" className="text-blue-600 hover:underline">
                    Add levels in Settings
                  </a>
                </p>
              ) : (
                <select
                  id="level"
                  name="level"
                  defaultValue={presentation?.level || ""}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select level...</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Internal notes about this presentation..."
              defaultValue={presentation?.notes || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
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
            defaultValue={presentation?.avNeeds?.notes || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        <a
          href={`/events/${eventId}/presentations`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
