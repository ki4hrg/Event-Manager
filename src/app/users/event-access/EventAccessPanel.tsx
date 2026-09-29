"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UNCAPPED } from "@/lib/accessLevels";
import {
  AccessLevelSelect,
  accessSelectClass,
} from "@/components/AccessLevelSelect";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { btnOutlinedSm } from "@/lib/buttonStyles";

type Assignment = {
  id: string;
  accessLevel: string | null;
  event: { id: string; name: string; year: string; seriesName: string | null };
};

type EventSearchResult = {
  id: string;
  name: string;
  year: string;
  seriesName: string | null;
};

type SeriesOption = { id: string; name: string; eventCount: number };

type Props = {
  assignments: Assignment[];
  seriesOptions: SeriesOption[];
  grantEvent: (eventId: string, accessLevel: string) => Promise<void>;
  setLevel: (staffId: string, eventId: string, accessLevel: string) => Promise<void>;
  revoke: (staffId: string, eventId: string) => Promise<void>;
  grantSeries: (
    seriesId: string,
    accessLevel: string,
  ) => Promise<{ granted: string[]; skipped: string[] }>;
  searchEvents: (query: string) => Promise<EventSearchResult[]>;
};


export function EventAccessPanel({
  assignments,
  seriesOptions,
  grantEvent,
  setLevel,
  revoke,
  grantSeries,
  searchEvents,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventSearchResult[]>([]);
  const [grantLevel, setGrantLevel] = useState("VIEW");

  const [seriesId, setSeriesId] = useState("");
  const [seriesLevel, setSeriesLevel] = useState("VIEW");

  useEffect(() => {
    if (query.length < 2) return;
    const timeoutId = setTimeout(async () => {
      try {
        setResults(await searchEvents(query));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query, searchEvents]);

  // Derived rather than cleared in the effect — a short query simply has no
  // results to show, and stale ones shouldn't flash while the next search debounces.
  const visibleResults = query.length < 2 ? [] : results;

  function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Event access
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Events this user is staff on. Access caps what their role allows on each one —
        it can narrow, never widen.
      </p>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400" role="status">
          {notice}
        </p>
      )}

      {seriesOptions.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-md flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <label
              htmlFor="grant-series"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Add to every event in a series
            </label>
            <select
              id="grant-series"
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
              className={`${accessSelectClass} w-full`}
            >
              <option value="">Select a series...</option>
              {seriesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.eventCount})
                </option>
              ))}
            </select>
          </div>
          <AccessLevelSelect
            ariaLabel="Access level for series grant"
            value={seriesLevel}
            onChange={setSeriesLevel}
          />
          <button
            type="button"
            disabled={!seriesId || isPending}
            onClick={() => {
              setError(null);
              setNotice(null);
              startTransition(async () => {
                try {
                  const { granted, skipped } = await grantSeries(seriesId, seriesLevel);
                  setNotice(
                    `Added to ${granted.length} event${granted.length === 1 ? "" : "s"}.` +
                      (skipped.length
                        ? ` Skipped ${skipped.length} you can't edit: ${skipped.join(", ")}.`
                        : ""),
                  );
                  setSeriesId("");
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not grant access");
                }
              });
            }}
            className={btnOutlinedSm}
          >
            Add
          </button>
        </div>
      )}

      <div className="mb-4">
        <label
          htmlFor="event-access-search"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Add a single event
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="event-access-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events by name..."
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <AccessLevelSelect
            ariaLabel="Access level for new assignment"
            value={grantLevel}
            onChange={setGrantLevel}
          />
        </div>
        {visibleResults.length > 0 && (
          <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md max-h-40 overflow-y-auto">
            {visibleResults.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  run(() => grantEvent(e.id, grantLevel));
                }}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 text-sm text-gray-900 dark:text-white"
              >
                {e.name}
                <span className="text-gray-400 dark:text-gray-500 text-xs">
                  {" "}
                  · {e.year}
                  {e.seriesName ? ` · ${e.seriesName}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {assignments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Not assigned to any events.
        </p>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-gray-200 dark:border-gray-700">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/events/${a.event.id}`}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {a.event.name}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {a.event.year}
                  {a.event.seriesName ? ` · ${a.event.seriesName}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0">
                <AccessLevelSelect
                  ariaLabel={`Access for ${a.event.name}`}
                  value={a.accessLevel ?? UNCAPPED}
                  disabled={isPending}
                  onChange={(next) => run(() => setLevel(a.id, a.event.id, next))}
                />
                <InlineDeleteButton
                  resource="USERS"
                  requiredLevel="WRITE"
                  action={async () => {
                    await revoke(a.id, a.event.id);
                    router.refresh();
                  }}
                  hiddenInputs={{}}
                  label="Revoke"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
