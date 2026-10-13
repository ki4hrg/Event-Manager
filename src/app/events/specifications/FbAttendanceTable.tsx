import Link from "next/link";
import { formatDateHeading } from "@/lib/agendaUtils";
import type { FbGrid } from "@/lib/esg/fbGrid";
import { reportTd, reportTh } from "@/lib/reportStyles";

// ESG §M day × meal grid of expected covers, from catering orders.
export function FbAttendanceTable({ grid, timezone, eventId }: { grid: FbGrid; timezone: string; eventId: string }) {
  if (grid.days.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No catering orders with a meal type and a scheduled function yet.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={reportTh}>Meal</th>
              {grid.days.map((d) => (
                <th key={d} className={`${reportTh} text-right`}>
                  {formatDateHeading(d, timezone)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.key}>
                <td className={reportTd}>{row.label}</td>
                {grid.days.map((d) => (
                  <td key={d} className={`${reportTd} text-right tabular-nums`}>
                    {row.cells[d] ? row.cells[d].expected : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grid.unplaced.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Not counted:{" "}
          {grid.unplaced.map((u, i) => (
            <span key={u.id}>
              {i > 0 && ", "}
              <Link href={`/events/${eventId}/catering-orders/${u.id}`} className="hover:underline">
                {u.name}
              </Link>{" "}
              ({u.reason === "no-meal-type" ? "no meal type" : "no scheduled function"})
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
