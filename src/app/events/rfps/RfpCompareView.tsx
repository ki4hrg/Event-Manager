import Link from "next/link";
import { formatMoney, formatNight } from "@/lib/hotels";
import { reportSectionCard, reportTd, reportTh } from "@/lib/reportStyles";
import { combinedSummary, combineQuery, comparisonRows, metSummary, type CompareGroup, type CompareOffer, type RfpComparison } from "@/lib/rfp/compare";

// Proposals side by side, one section per requested block: desktop/print is a
// table with one column per hotel; mobile is one card per hotel. When the
// group has a combined set (accepted proposals plus ones tried through
// ?combine=), it gets its own column / card; each open proposal links to add
// itself to the set or take itself out.

const muted = "text-gray-500 dark:text-gray-400 print:text-gray-600";
const short = "text-red-600 dark:text-red-400 print:text-red-700";
const desktop = "hidden sm:block print:block overflow-x-auto print:overflow-visible";

const money = (n: number | null) => (n == null ? "—" : formatMoney(n));

type Combine = { ids: string[]; href: string }; // href: the compare page

function Group({ g, data, eventId, combine }: { g: CompareGroup; data: RfpComparison; eventId: string | null; combine: Combine | null }) {
  const { concessions, amenities, meetingSpace, multiProperty } = data;
  const c = g.combined;
  // Accepted proposals are always in; declined ones can't be tried.
  const toggle = (o: CompareOffer) => {
    if (!combine || o.stage === "ACCEPTED" || o.stage === "DECLINED") return null;
    const on = combine.ids.includes(o.id);
    const ids = on ? combine.ids.filter((id) => id !== o.id) : [...combine.ids, o.id];
    return (
      <Link href={`${combine.href}${combineQuery(ids)}`} scroll={false} className="block text-xs font-normal normal-case tracking-normal text-blue-600 dark:text-blue-400 hover:underline">
        {on ? "− Remove" : "+ Combine"}
      </Link>
    );
  };
  const overNights = c ? Object.keys(c.overContracted).length : 0;
  const shortNights = c && g.requested ? Object.keys(c.gap).length : 0;
  const nightCount = (n: number) => `${n} ${n === 1 ? "night" : "nights"}`;
  const hotel = (o: CompareOffer) =>
    eventId ? (
      <Link href={`/events/${eventId}/hotels/proposals/${o.id}`} className="text-blue-600 dark:text-blue-400 hover:underline print:text-black">
        {o.hotel}
      </Link>
    ) : (
      o.hotel
    );
  const table = comparisonRows(g, concessions, amenities, data);
  return (
    <section className={reportSectionCard}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black">{g.label}</h2>
      {g.requested && (
        <p className={`text-sm mb-3 ${muted}`}>
          Requested {g.requested.roomNights} room nights · peak {g.requested.peak}
          {g.requested.targetRate != null && ` · target ${money(g.requested.targetRate)}`}
        </p>
      )}
      {c && (
        <p className={`text-sm mb-3 ${muted}`}>
          Combined: {combinedSummary(c)}
          {shortNights > 0 && <span className={short}>{` · short on ${nightCount(shortNights)}`}</span>}
          {overNights > 0 && <span className={short}>{` · contracted rooms over the request on ${nightCount(overNights)}`}</span>}
        </p>
      )}
      {g.offers.length === 0 ? (
        <p className={`text-sm ${muted}`}>No proposals yet.</p>
      ) : (
        <>
          <div className="sm:hidden print:hidden space-y-3">
            {c && (
              <div className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-1">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">Combined</p>
                  <p className="text-sm text-gray-900 dark:text-white tabular-nums">{money(c.avgRate)}</p>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className={g.requested && c.roomNights < g.requested.roomNights ? short : ""}>
                    {c.roomNights}
                    {g.requested && ` / ${g.requested.roomNights}`} room nights
                  </span>
                  {` · peak ${c.peak}`}
                  {c.rateRange && c.rateRange[0] !== c.rateRange[1] && ` · ${money(c.rateRange[0])}–${money(c.rateRange[1])}`}
                </p>
                {Object.keys(c.gap).length > 0 && (
                  <p className={`text-xs ${short}`}>Short: {Object.entries(c.gap).map(([n, k]) => `${formatNight(n)} −${k}`).join(", ")}</p>
                )}
                {Object.keys(c.over).length > 0 && (
                  <p className={`text-xs ${overNights ? short : muted}`}>
                    Over:{" "}
                    {Object.entries(c.over)
                      .map(([n, k]) => `${formatNight(n)} +${k}${c.overContracted[n] ? ` (${c.overContracted[n]} contracted)` : ""}`)
                      .join(", ")}
                  </p>
                )}
              </div>
            )}
            {g.offers.map((o) => (
              <div key={o.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{hotel(o)}</p>
                  <p className="text-sm text-gray-900 dark:text-white tabular-nums">{money(o.avgRate)}</p>
                </div>
                <div className={`flex justify-between gap-3 text-xs ${muted}`}>
                  <span>
                    {o.status}
                    {c && o.combined ? " · combined" : ""}
                  </span>
                  {toggle(o)}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className={!multiProperty && g.requested && o.roomNights < g.requested.roomNights ? short : ""}>
                    {o.roomNights}
                    {g.requested && ` / ${g.requested.roomNights}`} room nights
                  </span>
                  {` · peak ${o.peak}`}
                  {o.roomRevenue != null && ` · ${money(o.roomRevenue)}`}
                </p>
                {!multiProperty && Object.keys(o.shortfall).length > 0 && (
                  <p className={`text-xs ${short}`}>
                    Short: {Object.entries(o.shortfall).map(([n, k]) => `${formatNight(n)} −${k}`).join(", ")}
                  </p>
                )}
                <p className={`text-xs ${muted}`}>
                  {[o.attrition ? `attrition ${o.attrition}` : null, concessions.length ? metSummary(o, concessions.length) : null].filter(Boolean).join(" · ")}
                </p>
                {(meetingSpace.length > 0 || o.fbMinimum) && (
                  <p className={`text-xs ${muted}`}>
                    {[
                      meetingSpace.length ? `${meetingSpace.filter((r) => o.spaces[r.id]).length}/${meetingSpace.length} meeting rooms offered` : null,
                      o.fbMinimum ? `F&B minimum ${o.fbMinimum}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className={desktop}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={reportTh} />
                  {g.requested && <th className={`${reportTh} text-right`}>Requested</th>}
                  {c && <th className={`${reportTh} text-right`}>Combined</th>}
                  {g.offers.map((o) => (
                    <th key={o.id} className={`${reportTh} text-right whitespace-normal`}>
                      {hotel(o)}
                      {toggle(o)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={i}>
                    <td className={`${reportTd} font-medium whitespace-nowrap`}>{r.label}</td>
                    {g.requested && <td className={`${reportTd} text-right tabular-nums`}>{r.requested}</td>}
                    {r.combined && (
                      <td className={`${reportTd} text-right tabular-nums whitespace-pre-line bg-gray-50 dark:bg-gray-900 print:bg-transparent ${r.combined.short ? short : ""}`}>
                        {r.combined.text}
                      </td>
                    )}
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

export function RfpCompareView({ data, eventId, combine }: { data: RfpComparison; eventId: string | null; combine?: Combine | null }) {
  if (data.groups.length === 0) return <p className={`text-sm ${muted}`}>No blocks requested and no proposals linked yet.</p>;
  return (
    <div className="space-y-6 print:space-y-4">
      {data.groups.map((g, i) => (
        <Group key={i} g={g} data={data} eventId={eventId} combine={combine ?? null} />
      ))}
    </div>
  );
}
