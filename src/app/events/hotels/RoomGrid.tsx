import { formatMoney, formatNight } from "@/lib/hotels";

export type GridNight = { roomType: string | null; night: string; rate: string | null; rooms: number | null };

// Read-only room-type × night grid: rooms (and rate) per cell, nightly totals
// along the bottom. Shared by the proposal and block pages.
export function RoomGrid({ nights, emptyText = "No rooms entered." }: { nights: GridNight[]; emptyText?: string }) {
  if (nights.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>;
  const keys = Array.from(new Set(nights.map((n) => n.night))).sort();
  const types = Array.from(new Set(nights.map((n) => n.roomType)));
  const cell = (type: string | null, night: string) => nights.find((n) => n.roomType === type && n.night === night);
  const total = (night: string) => nights.filter((n) => n.night === night).reduce((s, n) => s + (n.rooms ?? 0), 0);
  const grand = nights.reduce((s, n) => s + (n.rooms ?? 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 pr-4 text-left font-medium text-gray-700 dark:text-gray-300">Room type</th>
            {keys.map((k) => (
              <th key={k} className="py-2 px-2 text-right font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                {formatNight(k)}
              </th>
            ))}
            <th className="py-2 pl-4 text-right font-medium text-gray-700 dark:text-gray-300">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {types.map((t) => (
            <tr key={t ?? "__roh__"}>
              <td className="py-2 pr-4 text-gray-900 dark:text-white whitespace-nowrap">{t ?? "Run of house"}</td>
              {keys.map((k) => {
                const c = cell(t, k);
                return (
                  <td key={k} className="py-2 px-2 text-right text-gray-900 dark:text-white whitespace-nowrap">
                    {c?.rooms ?? "—"}
                    {c?.rate != null && <div className="text-xs text-gray-500 dark:text-gray-400">{formatMoney(c.rate)}</div>}
                  </td>
                );
              })}
              <td className="py-2 pl-4 text-right font-medium text-gray-900 dark:text-white">
                {nights.filter((n) => n.roomType === t).reduce((s, n) => s + (n.rooms ?? 0), 0)}
              </td>
            </tr>
          ))}
          {types.length > 1 && (
            <tr className="font-medium">
              <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">Total</td>
              {keys.map((k) => (
                <td key={k} className="py-2 px-2 text-right text-gray-900 dark:text-white">
                  {total(k)}
                </td>
              ))}
              <td className="py-2 pl-4 text-right text-gray-900 dark:text-white">{grand}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
