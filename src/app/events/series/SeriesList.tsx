"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { btnPrimary, btnOutlinedSm } from "@/lib/buttonStyles";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { isUserError, type UserError } from "@/lib/userErrors";

type SeriesEvent = { id: string; name: string; year: string };
type Series = { id: string; name: string; totalEvents: number; events: SeriesEvent[] };

type Props = {
  series: Series[];
  canWrite: boolean;
  canDelete: boolean;
  createSeries: (formData: FormData) => Promise<void | UserError>;
  updateSeries: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteSeries: (id: string) => Promise<void | UserError>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btnPrimary}>
      {pending ? "Saving..." : label}
    </button>
  );
}

const inputClass =
  "block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export function SeriesList({
  series,
  canWrite,
  canDelete,
  createSeries,
  updateSeries,
  deleteSeries,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleCreate(formData: FormData) {
    setError(null);
    try {
      const result = await createSeries(formData);
      if (isUserError(result)) {
        setError(result.error);
        return;
      }
      setAdding(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create series");
    }
  }

  async function handleUpdate(id: string, formData: FormData) {
    setError(null);
    try {
      const result = await updateSeries(id, formData);
      if (isUserError(result)) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename series");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const result = await deleteSeries(id);
      if (isUserError(result)) {
        setError(result.error);
        return;
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete series");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {canWrite &&
        (adding ? (
          <form
            action={handleCreate}
            className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex flex-col sm:flex-row gap-3 sm:items-end"
          >
            <div className="flex-1">
              <label
                htmlFor="new-series-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Series name
              </label>
              <input
                type="text"
                id="new-series-name"
                name="name"
                required
                autoFocus
                placeholder="Annual Conference"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <SubmitButton label="Add series" />
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                className={btnOutlinedSm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={btnPrimary}>
            New Series
          </button>
        ))}

      {series.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No series yet.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          {series.map((s) => (
            <div key={s.id} className="p-4">
              {editingId === s.id ? (
                <form
                  action={(formData) => handleUpdate(s.id, formData)}
                  className="flex flex-col sm:flex-row gap-3 sm:items-end"
                >
                  <div className="flex-1">
                    <label htmlFor={`series-${s.id}`} className="sr-only">
                      Series name
                    </label>
                    <input
                      type="text"
                      id={`series-${s.id}`}
                      name="name"
                      required
                      autoFocus
                      defaultValue={s.name}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setError(null);
                      }}
                      className={btnOutlinedSm}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/events?series=${s.id}`}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {s.name}
                    </Link>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {s.events.length > 0
                        ? s.events.map((e) => e.year).join(" · ")
                        : s.totalEvents > 0
                          ? `${s.totalEvents} event${s.totalEvents === 1 ? "" : "s"}`
                          : "No events"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => setEditingId(s.id)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Rename
                      </button>
                    )}
                    {canDelete && s.totalEvents === 0 && (
                      <InlineDeleteButton
                        resource="EVENTS"
                        action={async () => {
                          await handleDelete(s.id);
                        }}
                        hiddenInputs={{}}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
