"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";
import Link from "next/link";
import type { ImportDestination, ColumnMapping } from "../../../presentations/actions";

type ImportResult = { created: number; errors: Array<{ row: number; message: string }> };

type ImportFormProps = {
  eventId: string;
  importAction: (rows: Record<string, string>[], mapping: ColumnMapping) => Promise<ImportResult>;
};

const DESTINATION_OPTIONS: { value: ImportDestination; label: string }[] = [
  { value: "skip", label: "— Skip —" },
  { value: "presentation.title", label: "Presentation: Title" },
  { value: "presentation.description", label: "Presentation: Description" },
  { value: "presentation.schedulingNotes", label: "Presentation: Scheduling Notes" },
  { value: "presentation.internalNotes", label: "Presentation: Internal Notes" },
  { value: "presentation.instanceCount", label: "Presentation: Times Offered" },
  { value: "contact.fullName", label: "Speaker: Full Name (auto-split)" },
  { value: "contact.firstName", label: "Speaker: First Name" },
  { value: "contact.lastName", label: "Speaker: Last Name" },
  { value: "contact.email", label: "Speaker: Email" },
];

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function autoDetect(header: string): ImportDestination {
  const h = normalizeHeader(header);
  if (h === "title" || h.includes("session name")) return "presentation.title";
  if (h === "description") return "presentation.description";
  if (h.includes("scheduling notes")) return "presentation.schedulingNotes";
  if (h.includes("internal notes")) return "presentation.internalNotes";
  if (h.includes("times offered") || h.includes("instance count") || h.includes("# of times")) return "presentation.instanceCount";
  if (h.includes("presenter name") || h.includes("speaker name") || h.includes("full name")) return "contact.fullName";
  if (h.includes("first name")) return "contact.firstName";
  if (h.includes("last name")) return "contact.lastName";
  if (h.includes("presenter email") || h.includes("speaker email") || h === "email") return "contact.email";
  return "skip";
}

type Step = "upload" | "map" | "preview" | "result";

export function ImportForm({ eventId, importAction }: ImportFormProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        if (parsed.errors.length && !parsed.data.length) {
          setParseError("Could not parse file. Make sure it is a valid CSV.");
          return;
        }
        const detectedHeaders = parsed.meta.fields ?? [];
        const defaultMapping: ColumnMapping = {};
        for (const h of detectedHeaders) {
          defaultMapping[h] = autoDetect(h);
        }
        setRows(parsed.data);
        setHeaders(detectedHeaders);
        setMapping(defaultMapping);
        setStep("map");
      },
      error: () => setParseError("Failed to read file."),
    });
  }, []);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importAction(rows, mapping);
      setResult(res);
      setStep("result");
    } finally {
      setImporting(false);
    }
  };

  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

  if (step === "upload") {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 max-w-lg">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Upload CSV</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Export your spreadsheet as CSV (File → Download → CSV), then upload it here.
        </p>
        {parseError && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{parseError}</p>
        )}
        <input
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900 dark:file:text-blue-200 hover:file:bg-blue-100"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    );
  }

  if (step === "map") {
    const activeCount = Object.values(mapping).filter((v) => v !== "skip").length;
    const takenDestinations = new Set(
      Object.values(mapping).filter((v) => v !== "skip" && v !== "presentation.internalNotes")
    );
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Map Columns</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {rows.length} rows detected. Assign each column to a field, or skip it. Multiple columns can map to Internal Notes.
        </p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 pr-4 font-medium">CSV Column</th>
                <th className="pb-2 pr-4 font-medium">Sample Value</th>
                <th className="pb-2 font-medium">Import As</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {headers.map((h) => {
                const current = mapping[h] ?? "skip";
                const availableOptions = DESTINATION_OPTIONS.filter(
                  (opt) =>
                    opt.value === "skip" ||
                    opt.value === "presentation.internalNotes" ||
                    opt.value === current ||
                    !takenDestinations.has(opt.value)
                );
                return (
                  <tr key={h}>
                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {h}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {rows[0]?.[h] ?? ""}
                    </td>
                    <td className="py-2">
                      <select
                        value={current}
                        onChange={(e) =>
                          setMapping((prev) => ({ ...prev, [h]: e.target.value as ImportDestination }))
                        }
                        className={inputClass}
                      >
                        {availableOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setStep("preview")}
            disabled={activeCount === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            Preview {rows.length} rows
          </button>
          <button
            onClick={() => setStep("upload")}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    const activeMappings = Object.entries(mapping).filter(([, dest]) => dest !== "skip");
    const previewRows = rows.slice(0, 5);

    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Preview</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Showing first {previewRows.length} of {rows.length} rows. Verify the data looks correct before importing.
        </p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                {activeMappings.map(([header, dest]) => (
                  <th key={header} className="pb-2 pr-4 font-medium whitespace-nowrap">
                    {dest === "presentation.internalNotes"
                      ? `Internal Notes: ${header}`
                      : (DESTINATION_OPTIONS.find((o) => o.value === dest)?.label ?? dest)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {previewRows.map((row, i) => (
                <tr key={i}>
                  {activeMappings.map(([header]) => (
                    <td key={header} className="py-2 pr-4 text-gray-900 dark:text-white max-w-xs truncate">
                      {row[header] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {importing ? "Importing..." : `Import ${rows.length} presentations`}
          </button>
          <button
            onClick={() => setStep("map")}
            disabled={importing}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // result
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 max-w-lg">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Import Complete</h2>
      <p className="text-sm text-gray-900 dark:text-white mb-2">
        <span className="font-medium">{result?.created}</span> presentation{result?.created !== 1 ? "s" : ""} created.
      </p>
      {result?.errors.length ? (
        <div className="mb-4">
          <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
            {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped:
          </p>
          <ul className="text-sm text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
            {result.errors.map((e, i) => (
              <li key={i}>Row {e.row}: {e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link
        href={`/events/${eventId}/presentations`}
        className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
      >
        View Presentations
      </Link>
    </div>
  );
}
