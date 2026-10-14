import type { ProposalChange } from "./core";

type Version = {
  id: string;
  revision: number;
  summary: string | null;
  changes: unknown;
  createdAt: Date;
  createdBy: { name: string | null; email: string } | null;
};

// Revisions newest first; each lists what changed from the one before it.
export function VersionHistory({ versions, timezone }: { versions: Version[]; timezone: string }) {
  if (versions.length <= 1) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Revisions</h2>
      <ol className="space-y-4">
        {versions.map((v) => {
          const changes = (Array.isArray(v.changes) ? v.changes : []) as ProposalChange[];
          return (
            <li key={v.id}>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Rev {v.revision}
                {v.summary && <span className="font-normal text-gray-700 dark:text-gray-300"> — {v.summary}</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {v.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone })}
                {v.createdBy ? ` · ${v.createdBy.name ?? v.createdBy.email}` : ""}
              </p>
              {changes.length > 0 && (
                <ul className="mt-1 text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
                  {changes.map((c, i) => (
                    <li key={i}>
                      <span className="text-gray-500 dark:text-gray-400">{c.field}:</span> {c.from ?? "—"} → {c.to ?? "—"}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
