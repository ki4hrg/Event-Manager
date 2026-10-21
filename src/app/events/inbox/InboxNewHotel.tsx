"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary } from "@/lib/buttonStyles";
import type { OfferHotel } from "@/lib/inboundParse";

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const inputClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";

const FIELDS: { key: keyof OfferHotel; label: string; wide?: boolean }[] = [
  { key: "name", label: "Hotel *", wide: true },
  { key: "address", label: "Address", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "contactFirstName", label: "Contact first name" },
  { key: "contactLastName", label: "Contact last name" },
  { key: "contactTitle", label: "Title" },
  { key: "contactEmail", label: "Email" },
  { key: "contactPhone", label: "Phone" },
];

// The offer's hotel isn't in Venues: add it (as lodging, with its contact),
// prefilled from the offer. The page renders it only for VENUES WRITE, which
// the event layout's PermissionsProvider doesn't carry.
export function InboxNewHotel({ hotel, create }: { hotel: OfferHotel; create: (hotel: OfferHotel) => Promise<void> }) {
  const router = useRouter();
  const [values, setValues] = useState<OfferHotel>(hotel);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        await create(values);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add the hotel");
      }
    });

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">New hotel</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className={`text-sm text-gray-700 dark:text-gray-300 ${f.wide ? "sm:col-span-3" : ""}`}>
            {f.label}
            <input
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <button type="button" disabled={pending || !values.name?.trim()} onClick={submit} className={`${btnPrimary} disabled:opacity-50`}>
        {pending ? "Adding..." : "Add hotel"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
