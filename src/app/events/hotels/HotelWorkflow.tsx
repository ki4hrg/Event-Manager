import Link from "next/link";
import type { WorkflowStatus, WorkflowStep, WorkflowStepKey } from "@/lib/hotelWorkflow";

// RFP → Proposal → Block → Guest list → Final review for one hotel's chain
// (src/lib/hotelWorkflow.ts), with the page it sits on marked. Scrolls
// sideways on a phone.

const MARK: Record<WorkflowStatus, string> = {
  done: "bg-green-600 dark:bg-green-500 text-white border-green-600 dark:border-green-500",
  active: "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500",
  todo: "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600",
  skipped: "bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 border-dashed border-gray-300 dark:border-gray-600",
  stopped: "bg-red-600 dark:bg-red-500 text-white border-red-600 dark:border-red-500",
};

const SYMBOL: Partial<Record<WorkflowStatus, string>> = { done: "✓", stopped: "✕", skipped: "–" };

export function HotelWorkflow({ steps, current }: { steps: WorkflowStep[]; current: WorkflowStepKey }) {
  return (
    <nav aria-label="Hotel workflow" className="mb-6 overflow-x-auto whitespace-nowrap print:hidden">
      <ol className="flex items-stretch gap-1">
        {steps.map((s, i) => {
          const here = s.key === current;
          const body = (
            <>
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${MARK[s.status]}`}>
                {SYMBOL[s.status] ?? i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${here ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-700 dark:text-gray-300"}`}>{s.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{s.state}</span>
              </span>
            </>
          );
          const box = `flex items-start gap-2 rounded-md px-3 py-2 ${
            here ? "bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200 dark:ring-blue-800" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          }`;
          return (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden className="text-gray-300 dark:text-gray-600">
                  →
                </span>
              )}
              {s.href && !here ? (
                <Link href={s.href} className={`${box} hover:bg-gray-50 dark:hover:bg-gray-700`} aria-label={`${s.label}: ${s.state}`}>
                  {body}
                </Link>
              ) : (
                <div className={box} aria-current={here ? "step" : undefined}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
