"use client";

import { useState } from "react";
import { STATUS_CLASS } from "@/lib/statusConstants";
import type { StatusCounts } from "@/lib/statusConstants";
import type { EntityStatus } from "@prisma/client";

export type EntityGroup = {
  label: string;
  basePath: string;
  counts: StatusCounts;
};

type StatusKey = EntityStatus | "noStatus";

const STATUS_ROWS: { key: StatusKey; label: string; badgeClass: string; urlParam: string }[] = [
  { key: "PENDING", label: "Pending", badgeClass: STATUS_CLASS.PENDING, urlParam: "PENDING" },
  { key: "IN_PROGRESS", label: "In Progress", badgeClass: STATUS_CLASS.IN_PROGRESS, urlParam: "IN_PROGRESS" },
  { key: "COMPLETE", label: "Complete", badgeClass: STATUS_CLASS.COMPLETE, urlParam: "COMPLETE" },
  { key: "CANCELLED", label: "Cancelled", badgeClass: STATUS_CLASS.CANCELLED, urlParam: "CANCELLED" },
  {
    key: "noStatus",
    label: "No Status",
    badgeClass: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
    urlParam: "__blank__",
  },
];

export function StatusSummaryCard({ groups }: { groups: EntityGroup[] }) {
  const [expanded, setExpanded] = useState<StatusKey | null>(null);

  const hasAnyItems = groups.some((g) => Object.values(g.counts).some((v) => v > 0));

  if (!hasAnyItems) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">No entities tracked</p>;
  }

  return (
    <div className="space-y-1">
      {STATUS_ROWS.map(({ key, label, badgeClass, urlParam }) => {
        const total = groups.reduce((sum, g) => sum + g.counts[key], 0);
        if (total === 0) return null;

        const isExpanded = expanded === key;
        const typeRows = groups.filter((g) => g.counts[key] > 0);

        return (
          <div key={key}>
            <button
              onClick={() => setExpanded(isExpanded ? null : key)}
              className="w-full flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1"
            >
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
                {label}
              </span>
              <div className="flex items-center gap-1">
                <span className="font-medium text-gray-900 dark:text-white">{total}</span>
                <svg
                  className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {isExpanded && (
              <div className="mt-1 ml-2 mb-1 space-y-1">
                {typeRows.map((g) => (
                  <div key={g.label} className="flex items-center justify-between text-xs">
                    <a
                      href={`${g.basePath}?status=${urlParam}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {g.label}
                    </a>
                    <span className="text-gray-600 dark:text-gray-400">{g.counts[key]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
