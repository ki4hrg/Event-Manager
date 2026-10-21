"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PermissionResource, QuoteStatus } from "@prisma/client";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { useCanWrite } from "@/components/PermissionsProvider";
import { colorClasses } from "@/lib/colors";
import { dateFromKey } from "@/lib/hotels";
import { RECIPIENT_STATE_COLORS, recipientState } from "@/lib/rfp/recipients";
import { QUOTE_STATUS_LABELS } from "@/lib/rfp/quotes";
import type { RfpRecipientArgs } from "./core";

export type VendorRecipientRow = {
  id: string;
  vendorId: string;
  name: string;
  sentOn: string | null; // YYYY-MM-DD
  declinedToBid: boolean;
  notes: string | null;
  quotes: { id: string; status: QuoteStatus; revision: number }[];
};

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4";
const smallInput =
  "px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const link = "text-sm text-blue-600 dark:text-blue-400 hover:underline";

// Who a vendor RFP went to, each with its state and quotes. Vendors tagged
// for the RFP's order type (or general-purpose) are offered first.
export function VendorRfpRecipients({
  eventId,
  rfpId,
  resource,
  recipients,
  responseDue,
  today,
  vendors,
  add,
  update,
  remove,
}: {
  eventId: string;
  rfpId: string;
  resource: PermissionResource;
  recipients: VendorRecipientRow[];
  responseDue: string | null;
  today: string;
  vendors: { id: string; name: string; fits: boolean }[];
  add: (vendorIds: string[]) => Promise<void>;
  update: (recipientId: string, args: RfpRecipientArgs) => Promise<void>;
  remove: (recipientId: string) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite(resource);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const listed = new Set(recipients.map((r) => r.vendorId));
  const unlisted = vendors.filter((v) => !listed.has(v.id));
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
  const patch = (r: VendorRecipientRow, changes: Partial<RfpRecipientArgs>) =>
    run(() => update(r.id, { sentOn: r.sentOn, declinedToBid: r.declinedToBid, notes: r.notes, ...changes }));

  return (
    <div className={`${cardClass} space-y-3`}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recipients</h2>
      {recipients.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No vendors yet.</p>}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {recipients.map((r) => {
          const { state, label } = recipientState(
            { sentOn: r.sentOn ? dateFromKey(r.sentOn) : null, declinedToBid: r.declinedToBid, responses: r.quotes.length },
            due,
            today,
          );
          return (
            <li key={r.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/vendors/${r.vendorId}`} className="text-sm font-medium text-gray-900 dark:text-white hover:underline min-w-0">
                  {r.name}
                </Link>
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
                {r.quotes.length === 0 && (
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
                {r.quotes.map((q, i) => (
                  <Link key={q.id} href={`/events/${eventId}/quotes/${q.id}`} className={link}>
                    {r.quotes.length === 1 ? "Quote" : `Quote ${i + 1}`} · {QUOTE_STATUS_LABELS[q.status]}
                    {q.revision > 1 ? ` · rev ${q.revision}` : ""}
                  </Link>
                ))}
                {canWrite && !r.declinedToBid && (
                  <Link href={`/events/${eventId}/rfps/${rfpId}/quotes/new?vendorId=${r.vendorId}`} className={link}>
                    Record quote
                  </Link>
                )}
                {r.quotes.length === 0 && (
                  <InlineDeleteButton action={async () => run(() => remove(r.id))} hiddenInputs={{}} label="Remove" resource={resource} requiredLevel="WRITE" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {canWrite && unlisted.length > 0 && (
        <select
          aria-label="Add vendor"
          value=""
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            if (id) run(() => add([id]));
          }}
          className={`${smallInput} w-full`}
        >
          <option value="">+ Vendor</option>
          {[true, false].map((fits) => {
            const shown = unlisted.filter((v) => v.fits === fits);
            return shown.length ? (
              <optgroup key={String(fits)} label={fits ? "Suggested" : "Other vendors"}>
                {shown.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
