"use client";

import { useState } from "react";
import {
  EXHIBIT_EQUIPMENT_SOURCES,
  EXHIBIT_MAX_EQUIPMENT,
  EXHIBIT_PROVIDERS,
  type ExhibitEquipmentSource,
  type ExhibitProvider,
  type ExhibitRequestBaseline,
  type ExhibitRequestPayload,
} from "@/lib/forms/meta";
import { Card, FormFrame, OnFile, inputCls, labelCls, type CommonFormProps, type DraftView } from "./FormParts";

type Props = CommonFormProps & {
  baseline: ExhibitRequestBaseline;
  draft: DraftView<ExhibitRequestPayload> | null;
};

// One power/AV question: hidden when the link offers no choices, fixed when
// it offers one.
function Service({
  name,
  label,
  needsLabel,
  allowed,
  provider,
  notes,
}: {
  name: string;
  label: string;
  needsLabel: string;
  allowed: ExhibitProvider[] | undefined;
  provider: string | null | undefined;
  notes: string | null | undefined;
}) {
  const options = EXHIBIT_PROVIDERS.filter((p) => !allowed || allowed.includes(p.value));
  if (options.length === 0) return null;
  return (
    <>
      {options.length === 1 ? (
        <OnFile label={label}>{options[0].label}</OnFile>
      ) : (
        <div>
          <label htmlFor={`${name}Provider`} className={labelCls}>{label}</label>
          <select id={`${name}Provider`} name={`${name}Provider`} defaultValue={provider ?? ""} className={inputCls}>
            <option value="">Not sure yet</option>
            {options.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`${name}Notes`} className={labelCls}>{needsLabel}</label>
        <input id={`${name}Notes`} name={`${name}Notes`} maxLength={2000} defaultValue={notes ?? ""} className={inputCls} />
      </div>
    </>
  );
}

function equipmentTitle(source: ExhibitEquipmentSource) {
  return source === "provide" ? "Equipment you need us to provide" : "Equipment you're bringing";
}

export function ExhibitRequestForm({ baseline, draft, ...common }: Props) {
  const p = draft?.payload ?? null;
  const sources = baseline.equipment ?? EXHIBIT_EQUIPMENT_SOURCES.map((src) => src.value);
  const saved = p?.equipment ?? [];
  const [rows, setRows] = useState<number[]>(() => (saved.length ? saved.map((_, i) => i) : [0]));
  // Re-added indices start blank, not with a removed row's saved answers.
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  const savedEquipment = saved.map((e, i) => (fresh.has(i) ? undefined : e));
  const addRow = () => {
    for (let i = 0; i < EXHIBIT_MAX_EQUIPMENT; i++) {
      if (!rows.includes(i)) {
        setFresh(new Set(fresh).add(i));
        return setRows([...rows, i]);
      }
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
          {baseline.boothTypes.length === 1 && <OnFile label="Booth type">{baseline.boothTypes[0]}</OnFile>}
          {baseline.boothTypes.length > 1 && (
            <div>
              <label htmlFor="boothType" className={labelCls}>Booth type</label>
              <select id="boothType" name="boothType" defaultValue={p?.boothType ?? ""} className={inputCls}>
                <option value="">No preference</option>
                {baseline.boothTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          {baseline.askLocation !== false && (
            <div>
              <label htmlFor="location" className={labelCls}>Preferred location</label>
              <input id="location" name="location" maxLength={200} defaultValue={p?.location ?? ""} className={inputCls} />
            </div>
          )}
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

      {(baseline.electrical?.length !== 0 || baseline.av?.length !== 0) && (
        <Card title={baseline.electrical?.length === 0 ? "Audio visual" : baseline.av?.length === 0 ? "Power" : "Power & audio visual"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Service name="electrical" label="Electrical" needsLabel="Electrical needs" allowed={baseline.electrical} provider={p?.electricalProvider} notes={p?.electricalNotes} />
            <Service name="av" label="Audio visual" needsLabel="Audio visual needs" allowed={baseline.av} provider={p?.avProvider} notes={p?.avNotes} />
          </div>
        </Card>
      )}

      {sources.length > 0 && (
        <Card title={sources.length === 1 ? equipmentTitle(sources[0]) : "Equipment & furnishings"}>
          <div className="space-y-3">
            {rows.map((index) => (
              <div key={index} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <label htmlFor={`equip_${index}_item`} className={labelCls}>Item</label>
                  <input id={`equip_${index}_item`} name={`equip_${index}_item`} maxLength={200} placeholder="e.g. 6 ft table, monitor, banner stand" defaultValue={savedEquipment[index]?.item ?? ""} className={inputCls} />
                </div>
                <div className="w-20">
                  <label htmlFor={`equip_${index}_quantity`} className={labelCls}>Qty</label>
                  <input id={`equip_${index}_quantity`} name={`equip_${index}_quantity`} type="number" min={0} max={99999} inputMode="numeric" defaultValue={savedEquipment[index]?.quantity ?? ""} className={inputCls} />
                </div>
                {sources.length > 1 && (
                  <div className="w-40">
                    <label htmlFor={`equip_${index}_source`} className={labelCls}>Who supplies it</label>
                    <select id={`equip_${index}_source`} name={`equip_${index}_source`} defaultValue={savedEquipment[index]?.source ?? sources[0]} className={inputCls}>
                      {EXHIBIT_EQUIPMENT_SOURCES.filter((src) => sources.includes(src.value)).map((src) => (
                        <option key={src.value} value={src.value}>{src.label}</option>
                      ))}
                    </select>
                  </div>
                )}
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
      )}

      <Card title="Anything else?">
        <label htmlFor="specialRequirements" className={labelCls}>Special requirements</label>
        <textarea id="specialRequirements" name="specialRequirements" rows={3} maxLength={2000} defaultValue={p?.specialRequirements ?? ""} className={inputCls} />
      </Card>
    </FormFrame>
  );
}
