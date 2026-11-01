"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";
import type { Venue } from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { useCanWrite } from "@/components/PermissionsProvider";
import { OptionSelect } from "@/components/ui/OptionSelect";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

type VenueFormProps = {
  venue?: Venue;
  brands: string[];
  areas: { label: string; group: string | null }[];
  // The hotel_amenity list.
  amenities: string[];
  // A new venue starts as lodging (from /hotels).
  defaultLodging?: boolean;
  action: (formData: FormData) => Promise<void | UserError>;
};

const fieldClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

const areaLabel = (a: { label: string; group: string | null }) => (a.group ? `${a.label} (${a.group})` : a.label);

function SaveButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimary} disabled:opacity-50`}
    >
      {pending ? "Saving..." : isEdit ? "Save" : "Create Venue"}
    </button>
  );
}

export function VenueForm({ venue, brands, areas, amenities, defaultLodging = false, action }: VenueFormProps) {
  const isEdit = !!venue;
  const canWrite = useCanWrite("VENUES");
  const [editing, setEditing] = useState(false);
  const [isLodging, setIsLodging] = useState(venue?.isLodging ?? defaultLodging);

  if (isEdit && (!editing || !canWrite)) {
    const addressParts = [venue.address, venue.city, venue.state, venue.zip, venue.country].filter(Boolean);
    const addressDisplay = addressParts.length > 0 ? addressParts.join(", ") : null;

    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Venue Details</h2>
          {canWrite && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Name" value={venue.name} />
          <ReadOnlyField label="Address" value={addressDisplay} />
          {venue.isLodging && (
            <ReadOnlyField
              label="Lodging"
              value={[venue.brand, venue.area ? areaLabel(areas.find((a) => a.label === venue.area) ?? { label: venue.area, group: null }) : null]
                .filter(Boolean)
                .join(" · ") || "Yes"}
            />
          )}
          {venue.isLodging && <ReadOnlyField label="Amenities" value={venue.amenities.join(", ") || null} />}
          <ReadOnlyField label="Notes" value={venue.notes} />
        </dl>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      {isEdit && (
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Venue Details</h2>
      )}
      <ActionForm
        action={action}
        onDone={() => isEdit && setEditing(false)}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Venue Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            defaultValue={venue?.name}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="address"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Address
          </label>
          <input
            type="text"
            id="address"
            name="address"
            defaultValue={venue?.address || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2">
            <label
              htmlFor="city"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              City
            </label>
            <input
              type="text"
              id="city"
              name="city"
              defaultValue={venue?.city || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="state"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              State
            </label>
            <input
              type="text"
              id="state"
              name="state"
              defaultValue={venue?.state || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="zip"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              ZIP
            </label>
            <input
              type="text"
              id="zip"
              name="zip"
              defaultValue={venue?.zip || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="country"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Country
          </label>
          <input
            type="text"
            id="country"
            name="country"
            defaultValue={venue?.country || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-4">
          <input type="hidden" name="isLodging" value={String(isLodging)} />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={isLodging}
              onChange={(e) => setIsLodging(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Sells sleeping rooms (hotel)
          </label>
          {isLodging && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="brand" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Brand
                </label>
                <OptionSelect id="brand" name="brand" defaultValue={venue?.brand} options={brands} className={fieldClass} />
              </div>
              <div>
                <label htmlFor="area" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Area
                </label>
                <select id="area" name="area" defaultValue={venue?.area ?? ""} className={fieldClass}>
                  <option value="">Not set</option>
                  {venue?.area && !areas.some((a) => a.label === venue.area) && <option value={venue.area}>{venue.area}</option>}
                  {areas.map((a) => (
                    <option key={a.label} value={a.label}>
                      {areaLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="sm:col-span-2">
                <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300">Amenities</legend>
                <input type="hidden" name="amenitiesField" value="true" />
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                  {[...amenities, ...(venue?.amenities ?? []).filter((a) => !amenities.includes(a))].map((a) => (
                    <label key={a} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        name="amenities"
                        value={a}
                        defaultChecked={venue?.amenities.includes(a)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      {a}
                      {!amenities.includes(a) && <span className="text-xs text-amber-700 dark:text-amber-300">(not in list)</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
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
            rows={3}
            defaultValue={venue?.notes || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <ActionFormError />
        <div className="flex gap-4">
          <SaveButton isEdit={isEdit} />
          {isEdit ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={btnSecondary}
            >
              Cancel
            </button>
          ) : (
            <Link
              href="/venues"
              className={btnSecondary}
            >
              Cancel
            </Link>
          )}
        </div>
      </ActionForm>
    </div>
  );
}
