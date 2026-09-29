import type { ResponsiblePartyGroup, EquipmentReportRow, EquipmentSourceRef } from "@/app/events/reports/actions";
import { partyGroupKey } from "@/app/events/reports/report-utils";
import { EmptyState } from "@/components/EmptyState";
import { ReportNav } from "@/components/ReportNav";

function sourceLabel(s: EquipmentSourceRef): string {
  if (s.functionType === "BREAKOUT_BLOCK") {
    return s.functionGroupName ? `Breakout: ${s.functionGroupName}` : "Breakout";
  }
  return s.functionTypeLabel || s.orderName || "—";
}

function SourceList({ sources }: { sources: EquipmentSourceRef[] }) {
  return (
    <div className="text-gray-600 dark:text-gray-400 text-sm space-y-0.5">
      {sources.map((s, i) => (
        <div key={`${s.orderId}-${i}`} className="flex items-baseline gap-1">
          <span>{sourceLabel(s)} ({s.quantity})</span>
          {!s.isScheduled && <span className="text-amber-600 dark:text-amber-400">†</span>}
        </div>
      ))}
    </div>
  );
}

function PeakCell({ row }: { row: EquipmentReportRow }) {
  if (!row.peakIsExact) return <span>≥{row.peakNeeded}</span>;
  return <span>{row.peakNeeded}</span>;
}

function PartyCard({ group, anchorId }: { group: ResponsiblePartyGroup; anchorId: string }) {
  const hasUnscheduled = group.rows.some((r) => r.sources.some((s) => !s.isScheduled));

  return (
    <div id={anchorId} className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden print:break-inside-avoid scroll-mt-24">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {group.partyName}
        </h2>
        {group.partyType === "contact" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Contact</p>
        )}
      </div>

      {group.rows.length === 0 ? (
        <p className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">No equipment items.</p>
      ) : (
        <>
          <div className="sm:hidden print:hidden divide-y divide-gray-100 dark:divide-gray-700">
            {group.rows.map((row, i) => (
              <div key={`${row.equipmentId ?? row.itemName}-${i}`} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{row.itemName}</p>
                    {row.category && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{row.category}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                    <p>Total <span className="text-gray-900 dark:text-white">{row.totalQuantity}</span></p>
                    <p>Peak <span className="text-gray-900 dark:text-white">{row.peakIsExact ? row.peakNeeded : `≥${row.peakNeeded}`}</span></p>
                  </div>
                </div>
                <div className="mt-2">
                  <SourceList sources={row.sources} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block print:block overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-[18%]">
                    Category
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-[27%]">
                    Item
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-[12%]">
                    Total Qty
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-[15%]">
                    Peak Needed
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-[28%]">
                    Sources
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {group.rows.map((row, i) => (
                  <tr key={`${row.equipmentId ?? row.itemName}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{row.category ?? ""}</td>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{row.itemName}</td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-white">{row.totalQuantity}</td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                      <PeakCell row={row} />
                    </td>
                    <td className="px-4 py-2">
                      <SourceList sources={row.sources} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasUnscheduled && (
        <p className="px-6 py-2 text-xs text-amber-600 dark:text-amber-400 border-t border-gray-100 dark:border-gray-700">
          † Unscheduled — peak is a floor estimate
        </p>
      )}
    </div>
  );
}

type EquipmentResponsibilityReportProps = {
  groups: ResponsiblePartyGroup[];
};

export function EquipmentResponsibilityReport({ groups }: EquipmentResponsibilityReportProps) {
  if (groups.length === 0) {
    return (
      <EmptyState message="No items." />
    );
  }

  const anchored = groups.map((group) => {
    const key = partyGroupKey(group);
    const anchorId = `party-${group.partyType === "unassigned" ? "unassigned" : group.partyId}`;
    return { group, key, anchorId };
  });

  return (
    <div className="space-y-6">
      <ReportNav links={anchored.map(({ group, anchorId }) => ({ id: anchorId, label: group.partyName }))} />
      {anchored.map(({ group, key, anchorId }) => (
        <PartyCard key={key} anchorId={anchorId} group={group} />
      ))}
    </div>
  );
}
