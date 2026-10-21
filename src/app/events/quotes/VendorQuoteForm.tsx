"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatDateKey, formatMoney } from "@/lib/hotels";
import { lineAmount, quoteTotals } from "@/lib/rfp/quotes";
import type { QuoteLineArgs } from "./core";

// The form's own values: numbers as typed (strings), dates as YYYY-MM-DD.
export type QuoteLineValues = {
  id: string | null;
  rfpLineItemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  notes: string;
};

export type QuoteValues = {
  vendorId: string;
  reference: string | null;
  submittedOn: string | null;
  validUntil: string | null;
  revision: number;
  serviceCharge: string | null;
  tax: string | null;
  otherFees: string | null;
  depositAmount: string | null;
  depositDue: string | null;
  cancellationTerms: string | null;
  notes: string | null;
  lines: QuoteLineValues[];
};

export type RfpLineChoice = { id: string; group: string | null; description: string; quantity: number | null; unit: string | null };

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const smallInput =
  "w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const legendClass = "text-sm font-semibold text-gray-900 dark:text-white";
const muted = "text-xs text-gray-500 dark:text-gray-400";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : label}
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const toArgs = (l: QuoteLineValues): QuoteLineArgs => ({
  id: l.id,
  rfpLineItemId: l.rfpLineItemId,
  description: l.description,
  quantity: num(l.quantity),
  unitPrice: num(l.unitPrice),
  amount: num(l.amount),
  notes: l.notes || null,
});
const money = (n: number | null) => (n == null ? "—" : formatMoney(String(n)));
const requested = (li: RfpLineChoice) => (li.quantity != null ? `${li.quantity}${li.unit ? ` ${li.unit}` : ""}` : (li.unit ?? ""));

// Every RFP line item gets a row (prefilled with what was asked), then the
// quote's own extras.
function startLines(values: QuoteValues | null, lineItems: RfpLineChoice[]): QuoteLineValues[] {
  const have = values?.lines ?? [];
  const asked = lineItems.map(
    (li) =>
      have.find((l) => l.rfpLineItemId === li.id) ?? {
        id: null,
        rfpLineItemId: li.id,
        description: li.description,
        quantity: li.quantity != null ? String(li.quantity) : "",
        unitPrice: "",
        amount: "",
        notes: "",
      },
  );
  return [...asked, ...have.filter((l) => !l.rfpLineItemId || !lineItems.some((li) => li.id === l.rfpLineItemId))];
}

export function VendorQuoteForm({
  resource,
  values,
  vendors,
  lineItems,
  defaultVendorId,
  action,
  cancelHref,
}: {
  resource: PermissionResource;
  values: QuoteValues | null; // null: a new quote
  vendors: { id: string; name: string }[];
  lineItems: RfpLineChoice[]; // the RFP's, or none for a standalone quote
  defaultVendorId?: string; // a new quote recorded from a recipient
  action: (formData: FormData) => Promise<void>;
  // Set on create only; an edit form toggles back to view mode instead.
  cancelHref?: string;
}) {
  const isEdit = values != null;
  const canWrite = useCanWrite(resource);
  const [editing, setEditing] = useState(!isEdit);
  const [lines, setLines] = useState(() => startLines(values, lineItems));
  const [fees, setFees] = useState({ serviceCharge: values?.serviceCharge ?? "", tax: values?.tax ?? "", otherFees: values?.otherFees ?? "" });
  const asked = new Map(lineItems.map((li) => [li.id, li]));
  const totals = quoteTotals({
    lines: lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount) })),
    serviceCharge: num(fees.serviceCharge),
    tax: num(fees.tax),
    otherFees: num(fees.otherFees),
  });
  const vendorName = vendors.find((v) => v.id === values?.vendorId)?.name ?? "—";

  if (isEdit && (!editing || !canWrite)) {
    const saved = values.lines;
    const facts: [string, ReactNode][] = [
      ["Vendor", vendorName],
      ["Reference", values.reference ?? "—"],
      ["Submitted", formatDateKey(values.submittedOn)],
      ["Valid until", formatDateKey(values.validUntil)],
      ["Revision", values.revision],
      ["Deposit", [values.depositAmount ? formatMoney(values.depositAmount) : null, values.depositDue ? `due ${formatDateKey(values.depositDue)}` : null].filter(Boolean).join(" ") || "—"],
      ["Cancellation", values.cancellationTerms ?? "—"],
    ];
    return (
      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Quote</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="text-gray-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
          {saved.map((l, i) => {
            const li = l.rfpLineItemId ? asked.get(l.rfpLineItemId) : undefined;
            return (
              <div key={i} className="flex flex-wrap justify-between gap-x-4 py-2">
                <div className="min-w-0">
                  <p className="text-gray-900 dark:text-white">{l.description}</p>
                  <p className={muted}>
                    {[li?.group, li ? null : "extra", l.quantity ? `qty ${l.quantity}` : null, l.unitPrice ? `@ ${formatMoney(l.unitPrice)}` : null, l.notes || null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="text-gray-900 dark:text-white tabular-nums">{money(lineAmount({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount) }))}</p>
              </div>
            );
          })}
          {lineItems
            .filter((li) => !saved.some((l) => l.rfpLineItemId === li.id))
            .map((li) => (
              <div key={li.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                <p className="text-gray-500 dark:text-gray-400">{li.description}</p>
                <p className="text-amber-700 dark:text-amber-300">not quoted</p>
              </div>
            ))}
        </div>
        <dl className="text-sm space-y-1 border-t border-gray-200 dark:border-gray-700 pt-3">
          {[
            ["Subtotal", money(totals.subtotal)],
            ["Fees", money(totals.fees)],
            ["Total", money(totals.total)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <dt className={label === "Total" ? "font-semibold text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}>{label}</dt>
              <dd className={`tabular-nums ${label === "Total" ? "font-semibold text-gray-900 dark:text-white" : "text-gray-900 dark:text-white"}`}>{value}</dd>
            </div>
          ))}
        </dl>
        {values.notes && <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{values.notes}</p>}
      </div>
    );
  }

  const setLine = (i: number, patch: Partial<QuoteLineValues>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addExtra = () => setLines((prev) => [...prev, { id: null, rfpLineItemId: null, description: "", quantity: "", unitPrice: "", amount: "", notes: "" }]);

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
      className={`${cardClass} space-y-6`}
    >
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.description.trim() || l.unitPrice || l.amount).map(toArgs))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Vendor *" htmlFor="q-vendorId">
          <select id="q-vendorId" name="vendorId" required defaultValue={values?.vendorId ?? defaultVendorId ?? ""} className={inputClass}>
            <option value="">Select a vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference" htmlFor="q-reference">
          <input id="q-reference" name="reference" placeholder="Quote number" defaultValue={values?.reference ?? ""} className={inputClass} />
        </Field>
        <Field label="Submitted" htmlFor="q-submittedOn">
          <input id="q-submittedOn" type="date" name="submittedOn" defaultValue={values?.submittedOn ?? ""} className={inputClass} />
        </Field>
        <Field label="Valid until" htmlFor="q-validUntil">
          <input id="q-validUntil" type="date" name="validUntil" defaultValue={values?.validUntil ?? ""} className={inputClass} />
        </Field>
        {isEdit && (
          <Field label="Revision" htmlFor="q-revision">
            <input id="q-revision" type="number" min={values.revision} name="revision" defaultValue={values.revision} className={inputClass} />
          </Field>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className={legendClass}>Pricing</legend>
        {lines.length === 0 && <p className={muted}>No lines yet.</p>}
        {lines.map((l, i) => {
          const li = l.rfpLineItemId ? asked.get(l.rfpLineItemId) : undefined;
          const amount = lineAmount({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount) });
          return (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
              {li && (
                <p className={muted}>
                  {[li.group, `asked ${requested(li) || "—"}`].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <input
                  aria-label="Description"
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  className={`${smallInput} col-span-2 sm:col-span-3`}
                />
                <input aria-label="Qty" type="number" min={0} step="any" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={smallInput} />
                <input aria-label="Unit price" type="number" min={0} step="0.01" placeholder="Unit $" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} className={smallInput} />
                <input
                  aria-label="Amount"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={amount != null && !l.amount ? String(amount) : "Amount $"}
                  value={l.amount}
                  onChange={(e) => setLine(i, { amount: e.target.value })}
                  className={smallInput}
                />
                <input aria-label="Notes" placeholder="Notes" value={l.notes} onChange={(e) => setLine(i, { notes: e.target.value })} className={`${smallInput} col-span-2 sm:col-span-5`} />
                {!li && (
                  <button type="button" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={addExtra} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          + Line
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={legendClass}>Fees & terms</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(
            [
              ["serviceCharge", "Service charge"],
              ["tax", "Tax"],
              ["otherFees", "Other fees"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`q-${key}`}>
              <input
                id={`q-${key}`}
                type="number"
                min={0}
                step="0.01"
                placeholder="$"
                name={key}
                value={fees[key]}
                onChange={(e) => setFees((f) => ({ ...f, [key]: e.target.value }))}
                className={inputClass}
              />
            </Field>
          ))}
          <Field label="Deposit" htmlFor="q-depositAmount">
            <input id="q-depositAmount" type="number" min={0} step="0.01" placeholder="$" name="depositAmount" defaultValue={values?.depositAmount ?? ""} className={inputClass} />
          </Field>
          <Field label="Deposit due" htmlFor="q-depositDue">
            <input id="q-depositDue" type="date" name="depositDue" defaultValue={values?.depositDue ?? ""} className={inputClass} />
          </Field>
        </div>
        <Field label="Cancellation" htmlFor="q-cancellationTerms">
          <input id="q-cancellationTerms" name="cancellationTerms" defaultValue={values?.cancellationTerms ?? ""} className={inputClass} />
        </Field>
        <Field label="Notes" htmlFor="q-notes">
          <textarea id="q-notes" name="notes" rows={3} defaultValue={values?.notes ?? ""} className={inputClass} />
        </Field>
      </fieldset>

      <p className="text-sm text-gray-900 dark:text-white">
        Subtotal {money(totals.subtotal)} · Fees {money(totals.fees)} · <span className="font-semibold">Total {money(totals.total)}</span>
      </p>

      <div className="flex flex-wrap gap-3">
        <SaveButton label={isEdit ? "Save" : "Record quote"} />
        {isEdit ? (
          <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
            Cancel
          </button>
        ) : (
          <Link href={cancelHref!} className={btnSecondary}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
