import { formatMoney, formatNight, roomTypeLabel } from "@/lib/hotels";

export type GridNight = { roomType: string | null; night: string; rate: string | null; rooms: number | null };

// Read-only night × room-type grid (the APEX / hotel-RFP layout): one row
// per night, rooms (and rate) per room type, a Total column, and peak night
// plus total room nights underneath. Shared by the proposal and block pages.
export function RoomGrid({ nights, emptyText = "No rooms entered." }: { nights: GridNight[]; emptyText?: string }) {
  if (nights.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>;
  const keys = Array.from(new Set(nights.map((n) => n.night))).sort();
  const types = Array.from(new Set(nights.map((n) => n.roomType)));
  const cell = (type: string | null, night: string) => nights.find((n) => n.roomType === type && n.night === night);
  const total = (night: string) => nights.filter((n) => n.night === night).reduce((s, n) => s + (n.rooms ?? 0), 0);
  const grand = nights.reduce((s, n) => s + (n.rooms ?? 0), 0);
  const peak = Math.max(0, ...keys.map(total));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 pr-4 text-left font-medium text-gray-700 dark:text-gray-300">Night</th>
            {types.map((t) => (
              <th key={t ?? "__roh__"} className="py-2 px-2 text-right font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                {roomTypeLabel(t)}
              </th>
            ))}
            {types.length > 1 && <th className="py-2 pl-4 text-right font-medium text-gray-700 dark:text-gray-300">Total</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {keys.map((k) => (
            <tr key={k}>
              <td className="py-2 pr-4 text-gray-900 dark:text-white whitespace-nowrap">{formatNight(k)}</td>
              {types.map((t) => {
                const c = cell(t, k);
                return (
                  <td key={t ?? "__roh__"} className="py-2 px-2 text-right text-gray-900 dark:text-white whitespace-nowrap">
                    {c?.rooms ?? "—"}
                    {c?.rate != null && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">@ {formatMoney(c.rate)}</span>}
                  </td>
                );
              })}
              {types.length > 1 && <td className="py-2 pl-4 text-right font-medium text-gray-900 dark:text-white">{total(k)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Peak night {peak} · {grand} room nights
      </p>
    </div>
  );
}
