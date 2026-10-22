"use client";

import { useState } from "react";
import {
  ITEM_KINDS,
  ITEM_REQUEST_MAX_LINES,
  ITEM_REQUEST_MODES,
  ITEM_SOURCES,
  type ItemRequestBaseline,
  type ItemRequestLine,
  type ItemRequestMode,
  type ItemRequestPayload,
} from "@/lib/forms/meta";
import { Card, FormFrame, inputCls, labelCls, type CommonFormProps, type DraftView } from "./FormParts";

type Props = CommonFormProps & {
  baseline: ItemRequestBaseline;
  draft: DraftView<ItemRequestPayload> | null;
};

function Line({
  index,
  position,
  line,
  mode,
  destinations,
  onRemove,
}: {
  index: number;
  position: number;
  line: ItemRequestLine | undefined;
  mode: ItemRequestMode;
  destinations: ItemRequestBaseline["destinations"];
  onRemove: (() => void) | null;
}) {
  const id = (f: string) => `item_${index}_${f}`;
  const sources = ITEM_SOURCES.filter((s) => mode === "request" || s.value !== "procure");
  const defaultSource = line?.source && sources.some((s) => s.value === line.source) ? line.source : sources[0].value;
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Item {position}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-600 dark:text-red-400 hover:underline">
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-3">
          <label htmlFor={id("description")} className={labelCls}>What is it?</label>
          <input id={id("description")} name={id("description")} required={position === 1} maxLength={300} defaultValue={line?.description ?? ""} className={inputCls} />
        </div>
        <div>
          <label htmlFor={id("quantity")} className={labelCls}>Quantity</label>
          <input id={id("quantity")} name={id("quantity")} type="number" min={0} max={999999} inputMode="numeric" defaultValue={line?.quantity ?? ""} className={inputCls} />
        </div>
        <div>
          <label htmlFor={id("kind")} className={labelCls}>Type</label>
          <select id={id("kind")} name={id("kind")} defaultValue={line?.kind ?? "supply"} className={inputCls}>
            {ITEM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id("source")} className={labelCls}>Source</label>
          <select id={id("source")} name={id("source")} key={mode} defaultValue={defaultSource} className={inputCls}>
            {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id("neededBy")} className={labelCls}>{mode === "incoming" ? "Arrives by" : "Needed by"}</label>
          <input id={id("neededBy")} name={id("neededBy")} type="date" defaultValue={line?.neededBy ?? ""} className={inputCls} />
        </div>
        <div>
          <label htmlFor={id("destination")} className={labelCls}>For</label>
          <select id={id("destination")} name={id("destination")} defaultValue={line?.destination ?? ""} className={inputCls}>
            <option value="">General / not sure</option>
            {destinations.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        {mode === "incoming" && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor={id("carrier")} className={labelCls}>Carrier</label>
              <input id={id("carrier")} name={id("carrier")} maxLength={80} defaultValue={line?.carrier ?? ""} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={id("tracking")} className={labelCls}>Tracking number</label>
              <input id={id("tracking")} name={id("tracking")} maxLength={120} defaultValue={line?.tracking ?? ""} className={inputCls} />
            </div>
          </>
        )}
        <div className="sm:col-span-4">
          <label htmlFor={id("notes")} className={labelCls}>Notes</label>
          <textarea id={id("notes")} name={id("notes")} rows={2} maxLength={1000} defaultValue={line?.notes ?? ""} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

export function ItemRequestForm({ baseline, draft, ...common }: Props) {
  const saved = draft?.payload?.items ?? [];
  const [mode, setMode] = useState<ItemRequestMode>(draft?.payload?.mode ?? "request");
  // Stable field indices: a removed row's index is reused, and the server
  // refuses any index at or past the cap.
  const [rows, setRows] = useState<number[]>(() => (saved.length ? saved.map((_, i) => i) : [0]));
  // Re-added indices start blank, not with a removed row's saved answers.
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  const addRow = () => {
    for (let i = 0; i < ITEM_REQUEST_MAX_LINES; i++) {
      if (!rows.includes(i)) {
        setFresh(new Set(fresh).add(i));
        return setRows([...rows, i]);
      }
    }
  };

  return (
    <FormFrame {...common} draft={draft}>
      <Card title="What's this about?">
        <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Request type">
          {ITEM_REQUEST_MODES.map((m) => (
            <label key={m.value} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="border-gray-300 dark:border-gray-600"
              />
              {m.label}
            </label>
          ))}
        </div>
      </Card>

      <Card title="Items">
        <div className="space-y-4">
          {rows.map((index, pos) => (
            <Line
              key={index}
              index={index}
              position={pos + 1}
              line={fresh.has(index) ? undefined : saved[index]}
              mode={mode}
              destinations={baseline.destinations}
              onRemove={rows.length > 1 ? () => setRows(rows.filter((r) => r !== index)) : null}
            />
          ))}
        </div>
        {rows.length < ITEM_REQUEST_MAX_LINES && (
          <button type="button" onClick={addRow} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            + Add another item
          </button>
        )}
      </Card>
    </FormFrame>
  );
}
