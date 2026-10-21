"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AmenityStatus } from "@prisma/client";
import { AMENITY_STATUS_LABELS } from "@/lib/hotels";
import { StatusCycle, type StatusCycleOption } from "@/components/ui/StatusCycle";

// An amenity as a proposal states it, against the hotel's profile: Confirmed
// (the offer commits to it) or Unavailable (not for this event). Unstated
// ones are the profile's word alone.
export type ProposalAmenity = { label: string; status: AmenityStatus; note: string | null };

const inlineInputClass =
  "px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const offProfileClass = "text-xs text-amber-700 dark:text-amber-300";

const AMENITY_STATUS_OPTIONS: StatusCycleOption<AmenityStatus | "">[] = [
  { value: "", label: "Not stated", color: "gray" },
  { value: "CONFIRMED", label: AMENITY_STATUS_LABELS.CONFIRMED, color: "green" },
  { value: "UNAVAILABLE", label: AMENITY_STATUS_LABELS.UNAVAILABLE, color: "red" },
];

// Profile amenities first (in profile order), then ones only the offer names.
export function amenityLabels(profile: string[], stated: ProposalAmenity[], added: string[] = []) {
  return Array.from(new Set([...profile, ...stated.map((a) => a.label), ...added]));
}

export function AmenityEditor({
  profile,
  list,
  value,
  added,
  onChange,
  onAdd,
}: {
  profile: string[];
  list: string[]; // the hotel_amenity list
  value: ProposalAmenity[];
  added: string[];
  onChange: (next: ProposalAmenity[]) => void;
  onAdd: (label: string) => void;
}) {
  const shown = amenityLabels(profile, value, added);
  const set = (label: string, patch: { status?: AmenityStatus | ""; note?: string | null }) => {
    const current = value.find((a) => a.label === label);
    const status = patch.status !== undefined ? patch.status : (current?.status ?? "");
    const rest = value.filter((a) => a.label !== label);
    if (!status) return onChange(rest);
    const note = patch.note !== undefined ? patch.note : (current?.note ?? null);
    onChange(current ? value.map((a) => (a.label === label ? { label, status, note } : a)) : [...value, { label, status, note }]);
  };
  const addable = list.filter((l) => !shown.includes(l));
  return (
    <div className="space-y-2">
      {shown.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No amenities on the hotel profile.</p>}
      {shown.map((label) => {
        const a = value.find((x) => x.label === label);
        return (
          <div key={label} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-900 dark:text-white min-w-[10rem] flex-1">
              {label}
              {!profile.includes(label) && <span className={offProfileClass}> · not on hotel profile</span>}
              {!list.includes(label) && <span className={offProfileClass}> · not in list</span>}
            </span>
            <StatusCycle
              label={`${label} in this offer`}
              value={a?.status ?? ""}
              options={AMENITY_STATUS_OPTIONS}
              onChange={(status) => set(label, { status })}
            />
            {a && (
              <input
                aria-label={`${label} note`}
                placeholder={a.status === "UNAVAILABLE" ? "Closed Apr 10–20…" : "Hours, limits, fees…"}
                value={a.note ?? ""}
                onChange={(e) => set(label, { note: e.target.value || null })}
                className={`${inlineInputClass} flex-1 min-w-[8rem]`}
              />
            )}
          </div>
        );
      })}
      {addable.length > 0 && (
        <select aria-label="Add amenity" value="" onChange={(e) => e.target.value && onAdd(e.target.value)} className={inlineInputClass}>
          <option value="">+ Amenity</option>
          {addable.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Read-only: every amenity on the profile or in the offer, with its status.
// addToHotel (VENUES WRITE) puts a confirmed off-profile amenity on the profile.
export function AmenityList({
  profile,
  stated,
  addToHotel,
}: {
  profile: string[];
  stated: ProposalAmenity[];
  addToHotel?: (label: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const shown = amenityLabels(profile, stated);
  if (shown.length === 0) return <span>—</span>;
  return (
    <ul className="space-y-1">
      {shown.map((label) => {
        const a = stated.find((x) => x.label === label);
        const onProfile = profile.includes(label);
        return (
          <li key={label} className="flex flex-wrap items-baseline gap-x-2">
            <span className={a?.status === "UNAVAILABLE" ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}>{label}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {[a ? AMENITY_STATUS_LABELS[a.status] : "On profile", a?.note].filter(Boolean).join(": ")}
            </span>
            {!onProfile && <span className={offProfileClass}>not on hotel profile</span>}
            {!onProfile && a?.status === "CONFIRMED" && addToHotel && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await addToHotel(label);
                    router.refresh();
                  })
                }
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                Add to hotel
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
