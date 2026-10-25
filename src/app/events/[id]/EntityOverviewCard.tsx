import type { EntityStatus } from "@prisma/client";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/statusConstants";
import type { StatusCounts } from "@/lib/statusConstants";
import type { EntityAttention, EntityWorkflowCounts } from "./actions";

type Props = {
  label: string;
  total: number;
  basePath: string;
  counts: StatusCounts;
  attention: EntityAttention[];
  workflows: EntityWorkflowCounts[];
  canEdit: boolean;
};

const STATUS_ORDER: EntityStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETE", "CANCELLED"];
const NO_STATUS_BADGE = "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
const DIM_BADGE = "bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-600";

export function EntityOverviewCard({ label, total, basePath, counts, attention, workflows, canEdit }: Props) {
  const activeAttention = attention.filter((a) => a.count > 0);
  const showAttention = canEdit && (attention.length > 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 dark:text-white tabular-nums">{total}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUS_ORDER.map((status) => {
          const count = counts[status];
          const cls = count > 0 ? STATUS_CLASS[status] : DIM_BADGE;
          if (count === 0) {
            return (
              <span key={status} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                {STATUS_LABEL[status]} 0
              </span>
            );
          }
          return (
            <a
              key={status}
              href={`${basePath}?status=${status}`}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls} hover:opacity-80`}
            >
              {STATUS_LABEL[status]} {count}
            </a>
          );
        })}
        {counts.noStatus > 0 ? (
          <a
            href={`${basePath}?status=__blank__`}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${NO_STATUS_BADGE} hover:opacity-80`}
          >
            No status {counts.noStatus}
          </a>
        ) : null}
      </div>

      {workflows.map((w) => (
        <div key={w.templateId} className="mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{w.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {w.steps.map((s) =>
              s.count === 0 ? (
                <span key={s.key} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DIM_BADGE}`}>
                  {s.label} 0
                </span>
              ) : (
                <a
                  key={s.key}
                  href={s.href}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:opacity-80"
                >
                  {s.label} {s.count}
                </a>
              ),
            )}
          </div>
        </div>
      ))}

      {showAttention ? (
        <div className="space-y-1 text-sm mb-3">
          {activeAttention.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500">All clear</p>
          ) : (
            activeAttention.map((a) => (
              <a
                key={a.label}
                href={a.href}
                className="block text-amber-600 dark:text-amber-500 hover:underline"
              >
                {a.count} {a.label}
              </a>
            ))
          )}
        </div>
      ) : null}

      <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
        <a
          href={basePath}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {label} →
        </a>
      </div>
    </div>
  );
}
