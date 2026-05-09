import type { ResponsiblePartyGroup, EquipmentReportRow, EquipmentSourceRef } from "@/app/events/reports/actions";
import { partyGroupKey } from "@/app/events/reports/report-utils";

function SourceList({ sources }: { sources: EquipmentSourceRef[] }) {
  return (
    <span className="text-gray-600 dark:text-gray-400 text-sm">
      {sources.map((s, i) => (
        <span key={`${s.orderId}-${i}`}>
          {i > 0 && ", "}
          <span className="inline-flex items-center gap-1">
            {s.functionNames.length > 0 ? s.functionNames.join(", ") : "—"}
            {" "}({s.quantity}){!s.isScheduled && <span className="text-amber-600 dark:text-amber-400">†</span>}
          </span>
        </span>
      ))}
    </span>
  );
}

function PeakCell({ row }: { row: EquipmentReportRow }) {
  if (!row.peakIsExact) return <span>≥{row.peakNeeded}</span>;
  return <span>{row.peakNeeded}</span>;
}

function PartyCard({ group }: { group: ResponsiblePartyGroup }) {
  const hasUnscheduled = group.rows.some((r) => r.sources.some((s) => !s.isScheduled));

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden print:break-inside-avoid">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-32">
                  Category
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  Item
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-20">
                  Total Qty
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-28">
                  Peak Needed
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
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
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
        No equipment items found for the selected filters.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <PartyCard key={partyGroupKey(group)} group={group} />
      ))}
    </div>
  );
}
