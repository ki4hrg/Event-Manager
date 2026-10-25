import Link from "next/link";
import type { ProgressStatus, ProgressStep } from "@/lib/workflowProgress";

// A workflow drawn as a row of steps (ProgressStrip, for a detail page) or a
// row of dots and the step in progress (ProgressDots, for a list row). Shared
// by the hotel chain (src/lib/hotelWorkflow.ts) and workflow templates
// (templateProgress in src/lib/workflowProgress.ts).

const MARK: Record<ProgressStatus, string> = {
  done: "bg-green-600 dark:bg-green-500 text-white border-green-600 dark:border-green-500",
  partial: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-600 dark:border-blue-500",
  active: "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500",
  todo: "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600",
  skipped: "bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 border-dashed border-gray-300 dark:border-gray-600",
  stopped: "bg-red-600 dark:bg-red-500 text-white border-red-600 dark:border-red-500",
};

const SYMBOL: Partial<Record<ProgressStatus, string>> = { done: "✓", stopped: "✕", skipped: "–" };

// `current` marks one step: the page it sits on (hotels) or the step in
// progress (templates). Scrolls sideways on a phone.
export function ProgressStrip({
  steps,
  current,
  label,
  title,
}: {
  steps: ProgressStep[];
  current: string | null;
  label: string;
  title?: string;
}) {
  return (
    <nav aria-label={label} className="overflow-x-auto whitespace-nowrap print:hidden">
      {title && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>}
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

const DOT: Record<ProgressStatus, string> = {
  done: "bg-green-600 dark:bg-green-500",
  // Half filled: some of the step's checklist items are ticked.
  partial:
    "border border-blue-600 dark:border-blue-500 bg-[linear-gradient(90deg,var(--color-blue-600)_50%,transparent_50%)] dark:bg-[linear-gradient(90deg,var(--color-blue-500)_50%,transparent_50%)] ring-2 ring-blue-200 dark:ring-blue-800",
  active: "bg-blue-600 dark:bg-blue-500 ring-2 ring-blue-200 dark:ring-blue-800",
  todo: "bg-gray-300 dark:bg-gray-600",
  skipped: "border border-dashed border-gray-400 dark:border-gray-500",
  stopped: "bg-red-600 dark:bg-red-500",
};

// Past this many steps the dots stop reading at a glance; show a count.
const MAX_DOTS = 8;

// Sits inside a row link, so no links of its own; each dot names its step.
// The label is the step in progress, `doneLabel` once every step is done, and
// nothing when the chain stopped (the row's status already says so).
export function ProgressDots({ steps, doneLabel = "Done", title }: { steps: ProgressStep[]; doneLabel?: string; title?: string }) {
  const stopped = steps.some((s) => s.status === "stopped");
  const now = steps.find((s) => s.status === "active" || s.status === "partial");
  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const summary = `${title ? `${title}: ` : ""}${steps.map((s) => `${s.label}: ${s.state}`).join("; ")}`;
  return (
    <span className="flex items-center gap-2" title={summary}>
      <span className="sr-only">{summary}</span>
      <span aria-hidden className="flex items-center gap-1">
        {steps.length > MAX_DOTS ? (
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {done}/{steps.length}
          </span>
        ) : (
          steps.map((s) => <span key={s.key} className={`h-2 w-2 shrink-0 rounded-full ${DOT[s.status]}`} />)
        )}
      </span>
      {!stopped && (
        <span aria-hidden className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {now ? now.label : doneLabel}
        </span>
      )}
    </span>
  );
}
