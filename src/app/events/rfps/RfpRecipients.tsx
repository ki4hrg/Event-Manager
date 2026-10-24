"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { useCanWrite } from "@/components/PermissionsProvider";
import { colorClasses } from "@/lib/colors";
import { dateFromKey } from "@/lib/hotels";
import { inScope, isEmptyScope, scopeLabels, type AreaOption, type AreaScope } from "@/lib/areas";
import { RECIPIENT_STATE_COLORS, recipientState } from "@/lib/rfp/recipients";
import type { RfpRecipientArgs } from "./core";
import type { OfferHotel } from "@/lib/inboundParse";
import { btnPrimary } from "@/lib/buttonStyles";
import { NEW_HOTEL, NEW_HOTEL_FIELDS, readNewHotel } from "@/app/events/hotels/proposalArgs";

export type RecipientRow = {
  id: string;
  venueId: string;
  name: string;
  location: string | null;
  sentOn: string | null; // YYYY-MM-DD
  declinedToBid: boolean;
  notes: string | null;
  responses: { id: string; status: string }[];
};

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4";
const smallInput =
  "px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const link = "text-sm text-blue-600 dark:text-blue-400 hover:underline";

export function RfpRecipients({
  eventId,
  recipients,
  responseDue,
  today,
  blocks,
  hotels,
  scope,
  requiredAmenities,
  areaOptions,
  add,
  addNew,
  update,
  remove,
  unlinked = [],
  linkProposal,
}: {
  eventId: string;
  recipients: RecipientRow[];
  responseDue: string | null;
  today: string;
  blocks: { id: string; label: string }[];
  hotels: { id: string; label: string; area: string | null; amenities: string[] }[];
  // Where this RFP looks for hotels (its own scope, else the event's); empty = all.
  scope: AreaScope;
  // The RFP's requested amenities: hotels need every one to be offered.
  requiredAmenities: string[];
  areaOptions: AreaOption[];
  add: (venueIds: string[]) => Promise<void>;
  // VENUES WRITE: "New hotel" creates one and adds it.
  addNew?: (hotel: OfferHotel) => Promise<void>;
  update: (recipientId: string, args: RfpRecipientArgs) => Promise<void>;
  remove: (recipientId: string) => Promise<void>;
  // The event's proposals that answer no RFP, and linking one to a block: a
  // citywide RFP sent out by a CVB brings offers from hotels never listed.
  unlinked?: { id: string; label: string }[];
  linkProposal?: (proposalId: string, blockId: string) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const listed = new Set(recipients.map((r) => r.venueId));
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const inArea = (h: { area: string | null }) => inScope(h.area, scope, areaOptions);
  const lacking = (h: { amenities: string[] }) => requiredAmenities.filter((a) => !h.amenities.includes(a));
  const fits = (h: (typeof hotels)[number]) => inArea(h) && lacking(h).length === 0;
  const unlisted = hotels.filter((h) => !listed.has(h.id) && (showAll || fits(h)));
  const outside = hotels.filter((h) => !listed.has(h.id) && !fits(h)).length;
  // Why a shown hotel doesn't fit: its area, the amenities it lacks.
  const misfit = (h: (typeof hotels)[number]) =>
    [!inArea(h) ? h.area : null, lacking(h).length ? `no ${lacking(h).join(", ")}` : null].filter(Boolean).join("; ");
  const filters = [...scopeLabels(scope), ...(requiredAmenities.length ? [`with ${requiredAmenities.join(", ")}`] : [])];
  const due = responseDue ? dateFromKey(responseDue) : null;

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  const patch = (r: RecipientRow, changes: Partial<RfpRecipientArgs>) =>
    run(() => update(r.id, { sentOn: r.sentOn, declinedToBid: r.declinedToBid, notes: r.notes, ...changes }));

  return (
    <div className={`${cardClass} space-y-3`}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recipients</h2>
      {recipients.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No hotels yet.</p>}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {recipients.map((r) => {
          const { state, label } = recipientState(
            { sentOn: r.sentOn ? dateFromKey(r.sentOn) : null, declinedToBid: r.declinedToBid, responses: r.responses.length },
            due,
            today,
          );
          return (
            <li key={r.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</p>
                  {r.location && <p className="text-xs text-gray-500 dark:text-gray-400">{r.location}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[RECIPIENT_STATE_COLORS[state]]}`}>{label}</span>
              </div>
              <fieldset disabled={!canWrite || pending} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                  Sent
                  <input
                    key={r.sentOn ?? "none"}
                    type="date"
                    aria-label={`${r.name} sent on`}
                    defaultValue={r.sentOn ?? ""}
                    onBlur={(e) => e.target.value !== (r.sentOn ?? "") && patch(r, { sentOn: e.target.value || null })}
                    className={smallInput}
                  />
                </label>
                {!r.sentOn && canWrite && (
                  <button type="button" onClick={() => patch(r, { sentOn: today })} className={link}>
                    Sent today
                  </button>
                )}
                {r.responses.length === 0 && (
                  <label className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={r.declinedToBid}
                      onChange={(e) => patch(r, { declinedToBid: e.target.checked })}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    Declined
                  </label>
                )}
              </fieldset>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {r.responses.map((p, i) => (
                  <Link key={p.id} href={`/events/${eventId}/hotels/proposals/${p.id}`} className={link}>
                    {r.responses.length === 1 ? "Proposal" : `Proposal ${i + 1}`} · {p.status}
                  </Link>
                ))}
                {canWrite &&
                  !r.declinedToBid &&
                  blocks.map((b) => (
                    <Link
                      key={b.id}
                      href={`/events/${eventId}/hotels/proposals/new?rfpBlockId=${b.id}&venueId=${r.venueId}`}
                      className={link}
                    >
                      {blocks.length === 1 ? "Record proposal" : `Record ${b.label.toLowerCase()} proposal`}
                    </Link>
                  ))}
                {r.responses.length === 0 && (
                  <InlineDeleteButton
                    action={async () => run(() => remove(r.id))}
                    hiddenInputs={{}}
                    label="Remove"
                    resource="HOTELS"
                    requiredLevel="WRITE"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {canWrite && (unlisted.length > 0 || addNew) && !adding && (
        <select
          aria-label="Add hotel"
          value=""
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            if (id === NEW_HOTEL) setAdding(true);
            else if (id) run(() => add([id]));
          }}
          className={`${smallInput} w-full`}
        >
          <option value="">+ Hotel</option>
          {addNew && <option value={NEW_HOTEL}>New hotel</option>}
          {unlisted.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
              {showAll && !fits(h) && misfit(h) ? ` (${misfit(h)})` : ""}
            </option>
          ))}
        </select>
      )}
      {adding && addNew && (
        <form
          action={(formData) =>
            run(async () => {
              const hotel = readNewHotel(formData);
              if (hotel) await addNew(hotel);
              setAdding(false);
            })
          }
          className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3"
        >
          <input type="hidden" name="venueId" value={NEW_HOTEL} />
          {NEW_HOTEL_FIELDS.map((f) => (
            <label key={f.key} className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              {f.label}
              <input name={`newHotel.${f.key}`} type={f.type ?? "text"} required={f.key === "name"} className={`${smallInput} mt-1 block w-full`} />
            </label>
          ))}
          <div className="flex gap-3">
            <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
              {pending ? "Adding..." : "Add hotel"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className={link}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {canWrite && linkProposal && unlinked.length > 0 && blocks.length > 0 && (
        <select
          aria-label="Link proposal"
          value=""
          disabled={pending}
          onChange={(e) => {
            const [proposalId, blockId] = e.target.value.split(" ");
            if (proposalId && blockId) run(() => linkProposal(proposalId, blockId));
          }}
          className={`${smallInput} w-full`}
        >
          <option value="">+ Existing proposal</option>
          {unlinked.flatMap((p) =>
            blocks.map((b) => (
              <option key={`${p.id} ${b.id}`} value={`${p.id} ${b.id}`}>
                {blocks.length === 1 ? p.label : `${p.label} · ${b.label}`}
              </option>
            )),
          )}
        </select>
      )}
      {canWrite && (!isEmptyScope(scope) || requiredAmenities.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">{filters.join(" · ")}</span>
          <div className="flex flex-wrap gap-3">
            {!showAll && unlisted.length > 1 && (
              <button type="button" disabled={pending} onClick={() => run(() => add(unlisted.map((h) => h.id)))} className={link}>
                Add all {unlisted.length}
              </button>
            )}
            {outside > 0 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className={link}>
                {showAll ? "Only matching hotels" : `Show all hotels (+${outside})`}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
