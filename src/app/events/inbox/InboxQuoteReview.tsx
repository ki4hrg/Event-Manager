"use client";

import { useState } from "react";
import { VendorQuoteForm, type QuoteValues, type RfpLineChoice } from "../quotes/VendorQuoteForm";
import { NEW_VENDOR } from "./views";

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

export type QuoteReview = {
  vendors: { id: string; name: string }[];
  rfps: { id: string; title: string; lineItems: RfpLineChoice[] }[];
  rfpId: string | null;
  vendorId: string | null;
  newVendorName: string | null;
  values: QuoteValues;
};

// A vendor's quote read from email: pick the vendor (or add a new one) and
// the vendor RFP it answers (or none), then check the prices and record it.
export function InboxQuoteReview({ review, apply, cancelHref }: { review: QuoteReview; apply: (formData: FormData) => Promise<void>; cancelHref: string }) {
  const [rfpId, setRfpId] = useState(review.rfpId ?? "");
  const [vendorId, setVendorId] = useState(review.vendorId ?? (review.newVendorName ? NEW_VENDOR : ""));
  const [newName, setNewName] = useState(review.newVendorName ?? "");
  const rfp = review.rfps.find((r) => r.id === rfpId);
  // Lines priced against the RFP it was read as; another RFP starts its lines fresh.
  const values = rfpId === (review.rfpId ?? "") ? review.values : { ...review.values, lines: review.values.lines.map((l) => ({ ...l, rfpLineItemId: null })) };
  return (
    <div className="space-y-4">
      <div className={`${cardClass} grid grid-cols-1 sm:grid-cols-2 gap-4`}>
        <div>
          <label htmlFor="iq-vendor" className={labelClass}>
            Vendor *
          </label>
          <select id="iq-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass}>
            <option value="">Select a vendor</option>
            <option value={NEW_VENDOR}>New vendor</option>
            {review.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {vendorId === NEW_VENDOR && (
            <input aria-label="New vendor name" placeholder="Vendor name" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} />
          )}
        </div>
        <div>
          <label htmlFor="iq-rfp" className={labelClass}>
            Answers
          </label>
          <select id="iq-rfp" value={rfpId} onChange={(e) => setRfpId(e.target.value)} className={inputClass}>
            <option value="">Standalone quote</option>
            {review.rfps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <VendorQuoteForm
        key={rfpId}
        resource="HOTELS"
        values={null}
        vendors={review.vendors}
        lineItems={rfp?.lineItems ?? []}
        hideVendor
        hiddenFields={{ rfpId, vendorId, newVendorName: vendorId === NEW_VENDOR ? newName : "" }}
        submitLabel="Record quote"
        initialValues={values}
        action={apply}
        cancelHref={cancelHref}
      />
    </div>
  );
}
