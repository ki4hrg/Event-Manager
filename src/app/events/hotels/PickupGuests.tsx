"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { OptionSelect } from "@/components/ui/OptionSelect";
import { btnOutlinedSm, btnPrimarySm } from "@/lib/buttonStyles";
import { rangeEndMin, syncRangeEnd } from "@/lib/dateRange";
import { formatDateKey } from "@/lib/hotels";
import { isUserError, type UserError } from "@/lib/userErrors";
import { keepFormValues } from "@/lib/keepFormValues";

export type PickupGuestValues = {
  id: string;
  guestName: string | null;
  confirmationNumber: string | null;
  checkIn: string | null;
  checkOut: string | null;
  roomType: string | null;
  cancelled: boolean;
  bookedOn: string | null;
  cancelledOn: string | null;
};

type Result = Promise<void | UserError>;

const inputClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm disabled:opacity-50";
const labelClass = "block text-sm text-gray-700 dark:text-gray-300";
const linkClass = "text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50";
const mutedLinkClass = "text-sm text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50";
// The list shows this many guests at most; the search reaches the rest.
const SHOWN = 200;

const matches = (g: PickupGuestValues, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || [g.guestName, g.confirmationNumber].some((v) => v?.toLowerCase().includes(q));
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btnPrimarySm}>
      {pending ? "Saving..." : label}
    </button>
  );
}

// Add or edit one guest. Check-out follows check-in (at least a night later),
// a cancel date can't precede the booking date.
function GuestForm({
  guest,
  defaults,
  roomTypes,
  submitLabel,
  save,
  close,
}: {
  guest: PickupGuestValues | null;
  defaults: { checkIn: string | null; checkOut: string | null };
  roomTypes: string[];
  submitLabel: string;
  save: (formData: FormData) => Result;
  close: () => void;
}) {
  const router = useRouter();
  const [cancelled, setCancelled] = useState(guest?.cancelled ?? false);
  const [error, setError] = useState<string | null>(null);
  const idp = guest ? `g-${guest.id}` : "g-new";
  const checkIn = guest ? guest.checkIn : defaults.checkIn;
  const bookedOn = guest?.bookedOn ?? null;

  return (
    <form
      onReset={keepFormValues}
      action={async (formData) => {
        setError(null);
        const result = await save(formData);
        if (isUserError(result)) {
          setError(result.error);
          return;
        }
        close();
        router.refresh();
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className={labelClass} htmlFor={`${idp}-name`}>
          Guest name
          <input id={`${idp}-name`} name="guestName" defaultValue={guest?.guestName ?? ""} autoFocus className={inputClass} />
        </label>
        <label className={labelClass} htmlFor={`${idp}-conf`}>
          Confirmation #
          <input id={`${idp}-conf`} name="confirmationNumber" defaultValue={guest?.confirmationNumber ?? ""} className={inputClass} />
        </label>
        <label className={labelClass} htmlFor={`${idp}-room`}>
          Room type
          <OptionSelect id={`${idp}-room`} name="roomType" options={roomTypes} defaultValue={guest?.roomType ?? null} className={inputClass} />
        </label>
        <label className={labelClass} htmlFor={`${idp}-booked`}>
          Booked on
          <input
            id={`${idp}-booked`}
            type="date"
            name="bookedOn"
            defaultValue={bookedOn ?? ""}
            onChange={(e) => syncRangeEnd(e.currentTarget, "cancelledOn", { fillEmpty: false })}
            className={inputClass}
          />
        </label>
        <label className={labelClass} htmlFor={`${idp}-in`}>
          Check-in
          <input
            id={`${idp}-in`}
            type="date"
            name="checkIn"
            required
            defaultValue={checkIn ?? ""}
            onChange={(e) => syncRangeEnd(e.currentTarget, "checkOut", { gapDays: 1 })}
            className={inputClass}
          />
        </label>
        <label className={labelClass} htmlFor={`${idp}-out`}>
          Check-out
          <input
            id={`${idp}-out`}
            type="date"
            name="checkOut"
            required
            min={rangeEndMin(checkIn, 1)}
            defaultValue={(guest ? guest.checkOut : defaults.checkOut) ?? ""}
            className={inputClass}
          />
        </label>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              name="cancelled"
              value="true"
              checked={cancelled}
              onChange={(e) => setCancelled(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Cancelled
          </label>
        </div>
        <label className={labelClass} htmlFor={`${idp}-cancelled`}>
          Cancelled on
          <input
            id={`${idp}-cancelled`}
            type="date"
            name="cancelledOn"
            disabled={!cancelled}
            min={rangeEndMin(bookedOn)}
            defaultValue={guest?.cancelledOn ?? ""}
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} />
        <button type="button" onClick={close} className={mutedLinkClass}>
          Cancel
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </form>
  );
}

function GuestRow({
  guest,
  roomTypes,
  editing,
  setEditing,
  updateGuest,
  setCancelled,
}: {
  guest: PickupGuestValues;
  roomTypes: string[];
  editing: boolean;
  setEditing: (editing: boolean) => void;
  updateGuest: (guestId: string, formData: FormData) => Result;
  setCancelled: (guestId: string, cancelled: boolean) => Result;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const g = guest;

  const toggle = (cancelled: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setCancelled(g.id, cancelled);
      if (isUserError(result)) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });

  return (
    <li id={`guest-${g.id}`} className="py-2 scroll-mt-24">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className={`min-w-0 text-sm ${g.cancelled ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
          <span className="break-words">{g.guestName ?? "—"}</span>
          {g.confirmationNumber && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">#{g.confirmationNumber}</span>}
          <div className="text-gray-500 dark:text-gray-400">
            {[
              g.roomType,
              g.checkIn && g.checkOut ? `${formatDateKey(g.checkIn)} – ${formatDateKey(g.checkOut)}` : null,
              g.bookedOn ? `booked ${formatDateKey(g.bookedOn)}` : null,
              g.cancelledOn ? `cancelled ${formatDateKey(g.cancelledOn)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button type="button" disabled={pending} onClick={() => setEditing(true)} className={linkClass}>
              Edit
            </button>
            {g.cancelled ? (
              <button type="button" disabled={pending} onClick={() => toggle(false)} className={linkClass}>
                Reinstate
              </button>
            ) : confirming ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(true)}
                  className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  Cancel reservation?
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={mutedLinkClass}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {editing && (
        <div className="mt-2">
          <GuestForm
            guest={g}
            defaults={{ checkIn: null, checkOut: null }}
            roomTypes={roomTypes}
            submitLabel="Save"
            save={(fd) => updateGuest(g.id, fd)}
            close={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  );
}

// The block's guests, one at a time: add, edit, cancel or reinstate. Each
// change rewrites today's pickup snapshot (the cores do).
export function PickupGuests({
  guests,
  roomTypes,
  checkIn,
  checkOut,
  initialGuestId,
  createGuest,
  updateGuest,
  setCancelled,
}: {
  guests: PickupGuestValues[];
  roomTypes: string[];
  // The block's stay, a new guest's default dates.
  checkIn: string | null;
  checkOut: string | null;
  // A guest to open for editing (?guest= from the block page).
  initialGuestId: string | null;
  createGuest: (formData: FormData) => Result;
  updateGuest: (guestId: string, formData: FormData) => Result;
  setCancelled: (guestId: string, cancelled: boolean) => Result;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(() =>
    initialGuestId && guests.some((g) => g.id === initialGuestId) ? initialGuestId : null,
  );
  const [query, setQuery] = useState("");
  const found = guests.filter((g) => g.id === editingId || matches(g, query));
  const shown = found.slice(0, SHOWN);
  const editingHidden = editingId && !shown.some((g) => g.id === editingId) ? found.find((g) => g.id === editingId) : undefined;
  if (editingHidden) shown.push(editingHidden);
  const active = guests.filter((g) => !g.cancelled).length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Guests</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={btnOutlinedSm}>
            Add guest
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <GuestForm
            guest={null}
            defaults={{ checkIn, checkOut }}
            roomTypes={roomTypes}
            submitLabel="Add guest"
            save={createGuest}
            close={() => setAdding(false)}
          />
        </div>
      )}

      {guests.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No guests yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {guests.length} guest{guests.length === 1 ? "" : "s"} · {active} active
              {found.length > SHOWN && ` · first ${SHOWN} of ${found.length} shown`}
            </p>
            <input
              type="search"
              aria-label="Search guests"
              placeholder="Name or confirmation #"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-64 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No matching guests.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {shown.map((g) => (
                <GuestRow
                  key={`${g.id}-${g.cancelled}`}
                  guest={g}
                  roomTypes={roomTypes}
                  editing={editingId === g.id}
                  setEditing={(on) => setEditingId(on ? g.id : null)}
                  updateGuest={updateGuest}
                  setCancelled={setCancelled}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
