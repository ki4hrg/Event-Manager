import Link from "next/link";
import { formatMoney, formatNight } from "@/lib/hotels";
import { reportSectionCard, reportTd, reportTh } from "@/lib/reportStyles";
import { comparisonRows, metSummary, type CompareGroup, type CompareOffer, type RfpComparison } from "@/lib/rfp/compare";

// Proposals side by side, one section per requested block: desktop/print is a
// table with one column per hotel; mobile is one card per hotel.

const muted = "text-gray-500 dark:text-gray-400 print:text-gray-600";
const short = "text-red-600 dark:text-red-400 print:text-red-700";
const desktop = "hidden sm:block print:block overflow-x-auto print:overflow-visible";

const money = (n: number | null) => (n == null ? "—" : formatMoney(n));

function Group({ g, concessions, eventId }: { g: CompareGroup; concessions: RfpComparison["concessions"]; eventId: string | null }) {
  const hotel = (o: CompareOffer) =>
    eventId ? (
      <Link href={`/events/${eventId}/hotels/proposals/${o.id}`} className="text-blue-600 dark:text-blue-400 hover:underline print:text-black">
        {o.hotel}
      </Link>
    ) : (
      o.hotel
    );
  const table = comparisonRows(g, concessions);
  return (
    <section className={reportSectionCard}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black">{g.label}</h2>
      {g.requested && (
        <p className={`text-sm mb-3 ${muted}`}>
          Requested {g.requested.roomNights} room nights · peak {g.requested.peak}
          {g.requested.targetRate != null && ` · target ${money(g.requested.targetRate)}`}
        </p>
      )}
      {g.offers.length === 0 ? (
        <p className={`text-sm ${muted}`}>No proposals yet.</p>
      ) : (
        <>
          <div className="sm:hidden print:hidden space-y-3">
            {g.offers.map((o) => (
              <div key={o.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{hotel(o)}</p>
                  <p className="text-sm text-gray-900 dark:text-white tabular-nums">{money(o.avgRate)}</p>
                </div>
                <p className={`text-xs ${muted}`}>{o.status}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className={g.requested && o.roomNights < g.requested.roomNights ? short : ""}>
                    {o.roomNights}
                    {g.requested && ` / ${g.requested.roomNights}`} room nights
                  </span>
                  {` · peak ${o.peak}`}
                  {o.roomRevenue != null && ` · ${money(o.roomRevenue)}`}
                </p>
                {Object.keys(o.shortfall).length > 0 && (
                  <p className={`text-xs ${short}`}>
                    Short: {Object.entries(o.shortfall).map(([n, k]) => `${formatNight(n)} −${k}`).join(", ")}
                  </p>
                )}
                <p className={`text-xs ${muted}`}>
                  {[o.attrition ? `attrition ${o.attrition}` : null, concessions.length ? metSummary(o, concessions.length) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
          </div>
          <div className={desktop}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={reportTh} />
                  {g.requested && <th className={`${reportTh} text-right`}>Requested</th>}
                  {g.offers.map((o) => (
                    <th key={o.id} className={`${reportTh} text-right whitespace-normal`}>
                      {hotel(o)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.label}>
                    <td className={`${reportTd} font-medium whitespace-nowrap`}>{r.label}</td>
                    {g.requested && <td className={`${reportTd} text-right tabular-nums`}>{r.requested}</td>}
                    {r.cells.map((c, i) => (
                      <td key={g.offers[i].id} className={`${reportTd} text-right tabular-nums whitespace-pre-line ${c.short ? short : ""}`}>
                        {c.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function RfpCompareView({ data, eventId }: { data: RfpComparison; eventId: string | null }) {
  if (data.groups.length === 0) return <p className={`text-sm ${muted}`}>No blocks requested and no proposals linked yet.</p>;
  return (
    <div className="space-y-6 print:space-y-4">
      {data.groups.map((g, i) => (
        <Group key={i} g={g} concessions={data.concessions} eventId={eventId} />
      ))}
    </div>
  );
}
