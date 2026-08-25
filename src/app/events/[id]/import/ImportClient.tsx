"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

type Item = {
  id: string;
  label: string;
  sublabel: string | null;
  /** A record of the same name already exists in the target event. */
  alreadyPresent: boolean;
};
type SourceOption = { id: string; label: string };
type ImportResult = {
  functions: number;
  presentations: number;
  schedules: number;
  slots: number;
  vendors: number;
  keyStaff: number;
  statusDefaults: number;
  notes: string[];
};

type Props = {
  eventId: string;
  sources: SourceOption[];
  initialSourceId: string;
  functions: Item[];
  presentations: Item[];
  loadContent: (sourceEventId: string) => Promise<{ functions: Item[]; presentations: Item[] }>;
  runImport: (args: {
    sourceEventId: string;
    functionIds: string[];
    presentationIds: string[];
    includeSchedules: boolean;
    includeContacts: boolean;
    includeVendors: boolean;
    includeKeyStaff: boolean;
    includeStatusDefaults: boolean;
  }) => Promise<ImportResult>;
};

const checkboxClass =
  "rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500";

function Spine({
  title,
  items,
  selected,
  onToggle,
  onAll,
  onNone,
}: {
  title: string;
  items: Item[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-gray-900 dark:text-white">
          {title}{" "}
          <span className="text-gray-500 dark:text-gray-400 font-normal">
            {selected.size} of {items.length}
          </span>
        </h2>
        {items.length > 0 && (
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              onClick={onAll}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              All new
            </button>
            <button
              type="button"
              onClick={onNone}
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              None
            </button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing to import.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-2 py-2 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => onToggle(item.id)}
                className={`${checkboxClass} mt-0.5`}
              />
              <span className="min-w-0">
                <span className="text-gray-900 dark:text-white">{item.label}</span>
                {item.alreadyPresent && (
                  <span className="ml-2 text-xs text-amber-700 dark:text-amber-500">
                    already in this event
                  </span>
                )}
                {item.sublabel && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {item.sublabel}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportClient({
  eventId,
  sources,
  initialSourceId,
  functions: initialFunctions,
  presentations: initialPresentations,
  loadContent,
  runImport,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [sourceId, setSourceId] = useState(initialSourceId);
  const [functions, setFunctions] = useState(initialFunctions);
  const [presentations, setPresentations] = useState(initialPresentations);

  const [fnSel, setFnSel] = useState<Set<string>>(new Set());
  const [presSel, setPresSel] = useState<Set<string>>(new Set());

  const [includeSchedules, setIncludeSchedules] = useState(false);
  const [includeContacts, setIncludeContacts] = useState(true);
  const [includeVendors, setIncludeVendors] = useState(true);
  const [includeKeyStaff, setIncludeKeyStaff] = useState(true);
  const [includeStatusDefaults, setIncludeStatusDefaults] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function toggle(set: Set<string>, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function changeSource(next: string) {
    setSourceId(next);
    setFnSel(new Set());
    setPresSel(new Set());
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const content = await loadContent(next);
        setFunctions(content.functions);
        setPresentations(content.presentations);
      } catch {
        setError("Could not load that event's content.");
      }
    });
  }

  const nothingSelected =
    fnSel.size === 0 &&
    presSel.size === 0 &&
    !includeVendors &&
    !includeKeyStaff &&
    !includeStatusDefaults;

  return (
    <div className="max-w-3xl space-y-4">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4" role="status">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
            Imported {result.functions} function{result.functions === 1 ? "" : "s"} and{" "}
            {result.presentations} presentation{result.presentations === 1 ? "" : "s"}.
          </p>
          <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc pl-5">
            {result.schedules > 0 && <li>{result.schedules} schedule entries</li>}
            {result.slots > 0 && <li>{result.slots} breakout assignments</li>}
            {result.vendors > 0 && <li>{result.vendors} event vendors</li>}
            {result.keyStaff > 0 && <li>{result.keyStaff} key staff</li>}
            {result.statusDefaults > 0 && <li>{result.statusDefaults} status defaults</li>}
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="flex gap-3 mt-3">
            <button
              type="button"
              onClick={() => router.push(`/events/${eventId}/functions`)}
              className={btnPrimary}
            >
              Go to Functions
            </button>
            <button type="button" onClick={() => setResult(null)} className={btnSecondary}>
              Import more
            </button>
          </div>
        </div>
      )}

      {!result && (
        <>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
            <label
              htmlFor="import-source"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Import from
            </label>
            <select
              id="import-source"
              value={sourceId}
              onChange={(e) => changeSource(e.target.value)}
              disabled={isPending}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <Spine
            title="Schedule — functions"
            items={functions}
            selected={fnSel}
            onToggle={(id) => setFnSel((s) => toggle(s, id))}
            onAll={() =>
              setFnSel(new Set(functions.filter((f) => !f.alreadyPresent).map((f) => f.id)))
            }
            onNone={() => setFnSel(new Set())}
          />

          <Spine
            title="Content — presentations"
            items={presentations}
            selected={presSel}
            onToggle={(id) => setPresSel((s) => toggle(s, id))}
            onAll={() =>
              setPresSel(
                new Set(presentations.filter((p) => !p.alreadyPresent).map((p) => p.id)),
              )
            }
            onNone={() => setPresSel(new Set())}
          />

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Pull along
            </h2>
            {(
              [
                ["Last year's times", includeSchedules, setIncludeSchedules],
                ["Contacts and speakers", includeContacts, setIncludeContacts],
                ["Event vendors", includeVendors, setIncludeVendors],
                ["Key staff", includeKeyStaff, setIncludeKeyStaff],
                ["Status defaults", includeStatusDefaults, setIncludeStatusDefaults],
              ] as const
            ).map(([label, checked, set]) => (
              <label
                key={label}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set(e.target.checked)}
                  className={checkboxClass}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={isPending || nothingSelected}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const r = await runImport({
                      sourceEventId: sourceId,
                      functionIds: Array.from(fnSel),
                      presentationIds: Array.from(presSel),
                      includeSchedules,
                      includeContacts,
                      includeVendors,
                      includeKeyStaff,
                      includeStatusDefaults,
                    });
                    setResult(r);
                    setFnSel(new Set());
                    setPresSel(new Set());
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Import failed");
                  }
                });
              }}
              className={`${btnPrimary} disabled:opacity-50`}
            >
              {isPending ? "Importing..." : "Import"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/events/${eventId}`)}
              className={btnSecondary}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
