"use client";

import { useState } from "react";
import {
  EXHIBIT_MAX_EQUIPMENT,
  EXHIBIT_PROVIDERS,
  type ExhibitRequestBaseline,
  type ExhibitRequestPayload,
} from "@/lib/forms/meta";
import { Card, FormFrame, OnFile, inputCls, labelCls, type CommonFormProps, type DraftView } from "./FormParts";

type Props = CommonFormProps & {
  baseline: ExhibitRequestBaseline;
  draft: DraftView<ExhibitRequestPayload> | null;
};

function Provider({ name, label, value }: { name: string; label: string; value: string | null | undefined }) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className={inputCls}>
        <option value="">Not sure yet</option>
        {EXHIBIT_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
    </div>
  );
}

export function ExhibitRequestForm({ baseline, draft, ...common }: Props) {
  const p = draft?.payload ?? null;
  const savedEquipment = p?.equipment ?? [];
  const [rows, setRows] = useState<number[]>(() => (savedEquipment.length ? savedEquipment.map((_, i) => i) : [0]));
  const addRow = () => {
    for (let i = 0; i < EXHIBIT_MAX_EQUIPMENT; i++) {
      if (!rows.includes(i)) return setRows([...rows, i]);
    }
  };

  return (
    <FormFrame {...common} draft={draft} orgLabel="Company">
      <Card title="Booth">
        {baseline.groupName && <OnFile label="Exhibit area">{baseline.groupName}</OnFile>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="company" className={labelCls}>Company or organization on the booth</label>
            <input id="company" name="company" required maxLength={120} defaultValue={p?.company ?? ""} className={inputCls} />
          </div>
          {baseline.boothTypes.length > 0 && (
            <div>
              <label htmlFor="boothType" className={labelCls}>Booth type</label>
              <select id="boothType" name="boothType" defaultValue={p?.boothType ?? ""} className={inputCls}>
                <option value="">No preference</option>
                {baseline.boothTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="location" className={labelCls}>Preferred location</label>
            <input id="location" name="location" maxLength={200} defaultValue={p?.location ?? ""} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="checkbox" name="shippingRequired" value="true" defaultChecked={p?.shippingRequired ?? false} className="rounded border-gray-300 dark:border-gray-600" />
            I&apos;ll ship materials to the venue
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="checkbox" name="customsRequired" value="true" defaultChecked={p?.customsRequired ?? false} className="rounded border-gray-300 dark:border-gray-600" />
            Shipment crosses a border
          </label>
        </div>
      </Card>

      <Card title="Booth contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contactFirstName" className={labelCls}>First name</label>
            <input id="contactFirstName" name="contactFirstName" maxLength={120} defaultValue={p?.contact?.firstName ?? ""} className={inputCls} />
          </div>
          <div>
            <label htmlFor="contactLastName" className={labelCls}>Last name</label>
            <input id="contactLastName" name="contactLastName" maxLength={120} defaultValue={p?.contact?.lastName ?? ""} className={inputCls} />
          </div>
          <div>
            <label htmlFor="contactEmail" className={labelCls}>Email</label>
            <input id="contactEmail" name="contactEmail" type="email" maxLength={200} defaultValue={p?.contact?.email ?? ""} className={inputCls} />
          </div>
          <div>
            <label htmlFor="contactPhone" className={labelCls}>Mobile phone</label>
            <input id="contactPhone" name="contactPhone" type="tel" maxLength={40} defaultValue={p?.contact?.phone ?? ""} className={inputCls} />
          </div>
        </div>
      </Card>

      <Card title="Power & audio visual">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Provider name="electricalProvider" label="Electrical" value={p?.electricalProvider} />
          <div>
            <label htmlFor="electricalNotes" className={labelCls}>Electrical needs</label>
            <input id="electricalNotes" name="electricalNotes" maxLength={2000} defaultValue={p?.electricalNotes ?? ""} className={inputCls} />
          </div>
          <Provider name="avProvider" label="Audio visual" value={p?.avProvider} />
          <div>
            <label htmlFor="avNotes" className={labelCls}>Audio visual needs</label>
            <input id="avNotes" name="avNotes" maxLength={2000} defaultValue={p?.avNotes ?? ""} className={inputCls} />
          </div>
        </div>
      </Card>

      <Card title="Equipment">
        <div className="space-y-3">
          {rows.map((index) => (
            <div key={index} className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <label htmlFor={`equip_${index}_item`} className={labelCls}>Item</label>
                <input id={`equip_${index}_item`} name={`equip_${index}_item`} maxLength={200} defaultValue={savedEquipment[index]?.item ?? ""} className={inputCls} />
              </div>
              <div className="w-24">
                <label htmlFor={`equip_${index}_quantity`} className={labelCls}>Qty</label>
                <input id={`equip_${index}_quantity`} name={`equip_${index}_quantity`} type="number" min={0} max={99999} inputMode="numeric" defaultValue={savedEquipment[index]?.quantity ?? ""} className={inputCls} />
              </div>
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows(rows.filter((r) => r !== index))} className="pb-2 text-xs text-red-600 dark:text-red-400 hover:underline">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {rows.length < EXHIBIT_MAX_EQUIPMENT && (
          <button type="button" onClick={addRow} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            + Add an item
          </button>
        )}
      </Card>

      <Card title="Anything else?">
        <label htmlFor="specialRequirements" className={labelCls}>Special requirements</label>
        <textarea id="specialRequirements" name="specialRequirements" rows={3} maxLength={2000} defaultValue={p?.specialRequirements ?? ""} className={inputCls} />
      </Card>
    </FormFrame>
  );
}
