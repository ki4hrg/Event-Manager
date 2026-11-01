"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatMoney } from "@/lib/hotels";
import { rangeEndMin, syncRangeEnd } from "@/lib/dateRange";
import { lineAmount, quoteTotals } from "@/lib/rfp/quotes";
import { useAutosave } from "@/lib/useAutosave";
import { ActionForm, ActionFormError } from "@/components/FormError";
import { isUserError, type UserError } from "@/lib/userErrors";
import { AutosaveStatus } from "@/components/AutosaveStatus";
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
// A line row keeps a key for its saved id (ids) across autosaves.
type LineRow = QuoteLineValues & { key: number };
const toArgs = (l: QuoteLineValues, id: string | null): QuoteLineArgs => ({
  id,
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
function startLines(values: QuoteValues | null, lineItems: RfpLineChoice[]): LineRow[] {
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
  return [...asked, ...have.filter((l) => !l.rfpLineItemId || !lineItems.some((li) => li.id === l.rfpLineItemId))].map((l, key) => ({ ...l, key }));
}

export function VendorQuoteForm({
  resource,
  values,
  vendors,
  lineItems,
  defaultVendorId,
  hideVendor = false,
  hiddenFields,
  initialValues,
  submitLabel,
  action,
  save,
  cancelHref,
}: {
  // The inbox review picks the vendor (and RFP) above the form and posts them here.
  hideVendor?: boolean;
  hiddenFields?: Record<string, string>;
  submitLabel?: string;
  // A new quote's starting values (one read from email).
  initialValues?: QuoteValues;
  resource: PermissionResource;
  values: QuoteValues | null; // null: a new quote
  vendors: { id: string; name: string }[];
  lineItems: RfpLineChoice[]; // the RFP's, or none for a standalone quote
  defaultVendorId?: string; // a new quote recorded from a recipient
  // A new quote submits through action; an existing one autosaves through
  // save (no redirect), which returns each posted line's saved id.
  action?: (formData: FormData) => Promise<void | UserError>;
  save?: (formData: FormData) => Promise<(string | null)[] | UserError>;
  cancelHref?: string;
}) {
  const isEdit = values != null;
  const canWrite = useCanWrite(resource);
  // Uncontrolled and autosaving: the form keeps the values it mounted with.
  const [start] = useState(values ?? initialValues ?? null);
  const [lines, setLines] = useState(() => startLines(start, lineItems));
  const [nextKey, setNextKey] = useState(lines.length);
  const [fees, setFees] = useState({ serviceCharge: start?.serviceCharge ?? "", tax: start?.tax ?? "", otherFees: start?.otherFees ?? "" });
  const asked = new Map(lineItems.map((li) => [li.id, li]));
  const totals = quoteTotals({
    lines: lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount) })),
    serviceCharge: num(fees.serviceCharge),
    tax: num(fees.tax),
    otherFees: num(fees.otherFees),
  });

  // Saved ids by line key: a line created by one save is updated by the next.
  const ids = useRef(new Map(lines.flatMap((l) => (l.id ? [[l.key, l.id] as const] : []))));
  const sendable = (rows: LineRow[]) => rows.filter((l) => l.description.trim() || l.unitPrice || l.amount || l.rfpLineItemId);
  // Each change bumps the version; the payload is read after the render that
  // follows (and kept for a save that runs after unmount), like RfpForm.
  const formRef = useRef<HTMLFormElement>(null);
  const payload = useRef<{ form: FormData; lines: LineRow[] } | null>(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  useEffect(() => {
    if (formRef.current) payload.current = { form: new FormData(formRef.current), lines: sendable(lines) };
  });
  const status = useAutosave(version, async () => {
    if (!payload.current || !save) return;
    const { form, lines: sent } = payload.current;
    const data = new FormData();
    form.forEach((v, k) => data.append(k, v));
    data.set("lines", JSON.stringify(sent.map((l) => toArgs(l, ids.current.get(l.key) ?? null))));
    const saved = await save(data);
    if (isUserError(saved)) return saved;
    sent.forEach((l, i) => {
      if (saved[i]) ids.current.set(l.key, saved[i]);
    });
  });

  const setLine = (key: number, patch: Partial<QuoteLineValues>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addExtra = () => {
    setLines((prev) => [...prev, { key: nextKey, id: null, rfpLineItemId: null, description: "", quantity: "", unitPrice: "", amount: "", notes: "" }]);
    setNextKey((k) => k + 1);
  };

  return (
    <ActionForm ref={formRef} action={isEdit ? undefined : action} onChange={isEdit ? bump : undefined} className={`${cardClass} space-y-6`}>
      {isEdit && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Quote</h2>
          <AutosaveStatus {...status} />
        </div>
      )}
      {!isEdit && <input type="hidden" name="lines" value={JSON.stringify(sendable(lines).map((l) => toArgs(l, null)))} />}
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset disabled={!canWrite} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!hideVendor && (
            <Field label="Vendor *" htmlFor="q-vendorId">
              <select id="q-vendorId" name="vendorId" required defaultValue={start?.vendorId ?? defaultVendorId ?? ""} className={inputClass}>
                <option value="">Select a vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Reference" htmlFor="q-reference">
            <input id="q-reference" name="reference" placeholder="Quote number" defaultValue={start?.reference ?? ""} className={inputClass} />
          </Field>
          <Field label="Submitted" htmlFor="q-submittedOn">
            <input
              id="q-submittedOn"
              type="date"
              name="submittedOn"
              defaultValue={start?.submittedOn ?? ""}
              onChange={(e) => syncRangeEnd(e.currentTarget, "validUntil", { fillEmpty: false })}
              className={inputClass}
            />
          </Field>
          <Field label="Valid until" htmlFor="q-validUntil">
            <input id="q-validUntil" type="date" name="validUntil" min={rangeEndMin(start?.submittedOn)} defaultValue={start?.validUntil ?? ""} className={inputClass} />
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
          {lines.map((l) => {
            const li = l.rfpLineItemId ? asked.get(l.rfpLineItemId) : undefined;
            const amount = lineAmount({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount) });
            return (
              <div key={l.key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
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
                    onChange={(e) => setLine(l.key, { description: e.target.value })}
                    className={`${smallInput} col-span-2 sm:col-span-3`}
                  />
                  <input aria-label="Qty" type="number" min={0} step="any" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className={smallInput} />
                  <input aria-label="Unit price" type="number" min={0} step="0.01" placeholder="Unit $" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} className={smallInput} />
                  <input
                    aria-label="Amount"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={amount != null && !l.amount ? String(amount) : "Amount $"}
                    value={l.amount}
                    onChange={(e) => setLine(l.key, { amount: e.target.value })}
                    className={smallInput}
                  />
                  <input aria-label="Notes" placeholder="Notes" value={l.notes} onChange={(e) => setLine(l.key, { notes: e.target.value })} className={`${smallInput} col-span-2 sm:col-span-5`} />
                  {!li && canWrite && (
                    <button
                      type="button"
                      onClick={() => {
                        setLines((prev) => prev.filter((x) => x.key !== l.key));
                        bump();
                      }}
                      className="text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {canWrite && (
            <button type="button" onClick={addExtra} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              + Line
            </button>
          )}
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
              <input id="q-depositAmount" type="number" min={0} step="0.01" placeholder="$" name="depositAmount" defaultValue={start?.depositAmount ?? ""} className={inputClass} />
            </Field>
            <Field label="Deposit due" htmlFor="q-depositDue">
              <input id="q-depositDue" type="date" name="depositDue" defaultValue={start?.depositDue ?? ""} className={inputClass} />
            </Field>
          </div>
          <Field label="Cancellation" htmlFor="q-cancellationTerms">
            <input id="q-cancellationTerms" name="cancellationTerms" defaultValue={start?.cancellationTerms ?? ""} className={inputClass} />
          </Field>
          <Field label="Notes" htmlFor="q-notes">
            <textarea id="q-notes" name="notes" rows={3} defaultValue={start?.notes ?? ""} className={inputClass} />
          </Field>
        </fieldset>
      </fieldset>

      <p className="text-sm text-gray-900 dark:text-white">
        Subtotal {money(totals.subtotal)} · Fees {money(totals.fees)} · <span className="font-semibold">Total {money(totals.total)}</span>
      </p>

      {!isEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <ActionFormError className="basis-full" />
          <SaveButton label={submitLabel ?? "Record quote"} />
          <Link href={cancelHref!} className={btnSecondary}>
            Cancel
          </Link>
        </div>
      )}
    </ActionForm>
  );
}
