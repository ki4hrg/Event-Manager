import { formatDateKey } from "@/lib/hotels";
import type { DaysOutPoint } from "@/lib/hotelPickup";

const thClass = "py-2 px-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap";
const tdClass = "py-2 px-2 text-gray-900 dark:text-white whitespace-nowrap";

// Pickup at each of the tenant's checkpoints (days before the block's first
// night), against the current block.
export function DaysOutCard({ points, blocked }: { points: DaysOutPoint[]; blocked: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Pickup by days out</h2>
      {points.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No checkpoints.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className={thClass}>Days out</th>
                <th className={thClass}>As of</th>
                <th className={`${thClass} text-right`}>Picked up</th>
                <th className={`${thClass} text-right`}>% of {blocked}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {points.map((p) => (
                <tr key={p.daysOut}>
                  <td className={tdClass}>{p.daysOut}</td>
                  <td className={tdClass}>{p.asOf ? formatDateKey(p.asOf) : "—"}</td>
                  <td className={`${tdClass} text-right`}>{p.pickedUp ?? "—"}</td>
                  <td className={`${tdClass} text-right`}>{p.percent != null ? `${p.percent}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
