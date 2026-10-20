import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { reportTd, reportTh } from "@/lib/reportStyles";
import { blockTypeLabel, formatDateKey, formatNight, parseContractTypes } from "@/lib/hotels";
import { eventRoles, offsetLabel, patternStats, proposedRoles, proposeNights, roleLabel, type PatternBasis } from "@/lib/hotelPattern";
import { getBlockMonitoring, getHotelCities, getHotelGuestTypes, getHotelPickupHistory, getPickupPattern, getProposalEventChoices, getSeriesChoices, type PatternFilters } from "../actions";
import { CsvButton, HotelReportFilters, PatternFilters as PatternFilterBar, ProposalControls, ShowBlockToggle } from "./HotelReportFilters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotel reports" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pct = (n: number | null) => (n == null ? "—" : `${n}%`);
const share = (part: number, whole: number | null) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—");

function Tabs({ view }: { view: string }) {
  const tab = (key: string, label: string) => (
    <Link
      href={`/hotels/reports?view=${key}`}
      className={`pb-2 text-sm font-medium border-b-2 ${
        view === key
          ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-6 overflow-x-auto whitespace-nowrap border-b border-gray-200 dark:border-gray-700 mb-6">
      {tab("history", "Pickup history")}
      {tab("monitoring", "Monitoring")}
      {tab("pattern", "RFP pattern")}
    </nav>
  );
}

async function History({ seriesId, from, to, byHotel }: { seriesId?: string; from?: string; to?: string; byHotel: boolean }) {
  const [events, series] = await Promise.all([getHotelPickupHistory({ seriesId, from, to }), getSeriesChoices()]);
  const csv = events.flatMap((e) =>
    (byHotel ? e.hotels : [null]).map((h) => ({
      Event: e.name,
      Series: e.series?.name ?? "",
      Start: e.startDate,
      Hotel: h?.hotel ?? "All",
      Blocked: h ? h.blocked : e.blocked,
      "Picked up": h ? h.pickedUp : e.pickedUp,
      "Pickup %": h ? h.percent : e.percent,
      "Peak night": h ? h.peakNight : e.peakNight,
      Attendance: e.actualAttendance,
      Membership: e.membershipCount,
    })),
  );
  const headers = ["Event", "Start", "Hotels", "Blocked", "Picked up", "%", "Peak night", "Attendance", "Peak / attendance", "Membership", "Peak / membership"];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <HotelReportFilters series={series} />
        <CsvButton fileName="hotel-pickup.csv" rows={csv} />
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No events with blocks.</p>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow rounded-lg">
          <table className="min-w-full">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={h} className={`${reportTh} ${i > 1 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <Fragment key={e.id}>
                  <tr>
                    <td className={reportTd}>
                      <Link href={`/events/${e.id}/hotels`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {e.name}
                      </Link>
                      {e.series && <div className="text-gray-500 dark:text-gray-400">{e.series.name}</div>}
                    </td>
                    <td className={reportTd}>{formatDateKey(e.startDate)}</td>
                    <td className={`${reportTd} text-right`}>{e.hotels.length}</td>
                    <td className={`${reportTd} text-right`}>{e.blocked}</td>
                    <td className={`${reportTd} text-right`}>{e.pickedUp}</td>
                    <td className={`${reportTd} text-right`}>{pct(e.percent)}</td>
                    <td className={`${reportTd} text-right`}>{e.peakNight}</td>
                    <td className={`${reportTd} text-right`}>{e.actualAttendance ?? "—"}</td>
                    <td className={`${reportTd} text-right`}>{share(e.peakNight, e.actualAttendance)}</td>
                    <td className={`${reportTd} text-right`}>{e.membershipCount ?? "—"}</td>
                    <td className={`${reportTd} text-right`}>{share(e.peakNight, e.membershipCount)}</td>
                  </tr>
                  {byHotel &&
                    e.hotels.map((h) => (
                      <tr key={`${e.id}-${h.blockId}`}>
                        <td className={`${reportTd} pl-8`} colSpan={3}>
                          {h.hotel}
                          {h.isHq && " (HQ)"}
                          {blockTypeLabel(h.contractType, h.guestType) && <span className="text-gray-500 dark:text-gray-400"> · {blockTypeLabel(h.contractType, h.guestType)}</span>}
                        </td>
                        <td className={`${reportTd} text-right`}>{h.blocked}</td>
                        <td className={`${reportTd} text-right`}>{h.pickedUp}</td>
                        <td className={`${reportTd} text-right`}>{pct(h.percent)}</td>
                        <td className={`${reportTd} text-right`}>{h.peakNight}</td>
                        <td className={reportTd} colSpan={4} />
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function Monitoring() {
  const blocks = await getBlockMonitoring();
  const csv = blocks.map((b) => ({
    Event: b.event.name,
    Start: b.event.startDate,
    Hotel: b.hotel,
    "Cut-off": b.cutoffDate,
    Blocked: b.blocked,
    "Picked up": b.pickedUp,
    "Pickup %": b.percent,
    "Attrition floor %": b.floor,
    "At risk": b.atRisk ? "Yes" : "No",
  }));
  const headers = ["Event", "Hotel", "Cut-off", "Blocked", "Picked up", "%", "Floor"];
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {blocks.length} block{blocks.length === 1 ? "" : "s"} · {blocks.filter((b) => b.atRisk).length} at risk
        </p>
        <CsvButton fileName="hotel-monitoring.csv" rows={csv} />
      </div>
      {blocks.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming blocks.</p>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow rounded-lg">
          <table className="min-w-full">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={h} className={`${reportTh} ${i > 2 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.blockId}>
                  <td className={reportTd}>
                    {b.event.name}
                    <div className="text-gray-500 dark:text-gray-400">{formatDateKey(b.event.startDate)}</div>
                  </td>
                  <td className={reportTd}>
                    <Link href={`/events/${b.event.id}/hotels/blocks/${b.blockId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      {b.hotel}
                    </Link>
                  </td>
                  <td className={reportTd}>{formatDateKey(b.cutoffDate)}</td>
                  <td className={`${reportTd} text-right`}>{b.blocked}</td>
                  <td className={`${reportTd} text-right`}>{b.pickedUp}</td>
                  <td className={`${reportTd} text-right ${b.atRisk ? "text-red-600 dark:text-red-400 font-semibold" : ""}`}>{pct(b.percent)}</td>
                  <td className={`${reportTd} text-right`}>{pct(b.floor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function Pattern({
  filters,
  basis,
  adjust,
  forEvent,
  customStart,
  customEnd,
  showBlock,
}: {
  filters: PatternFilters;
  basis: PatternBasis;
  adjust: number;
  forEvent?: string;
  customStart?: string;
  customEnd?: string;
  showBlock: boolean;
}) {
  // An unknown guest type in the URL means no filter, not an empty pattern.
  const guestTypes = await getHotelGuestTypes();
  const valid = { ...filters, guestTypes: filters.guestTypes.filter((g) => guestTypes.includes(g)) };
  const [{ events, noPickup }, series, cities, upcoming] = await Promise.all([
    getPickupPattern(valid),
    getSeriesChoices(),
    getHotelCities(),
    getProposalEventChoices(),
  ]);
  // The proposed block takes an upcoming event's dates — the one picked, else
  // the series filter's next event — or custom dates.
  const inSeries = (e: (typeof upcoming)[number]) =>
    !filters.seriesId || (filters.seriesId === "__blank__" ? e.seriesId == null : e.seriesId === filters.seriesId);
  const target =
    forEvent === "custom" ? undefined : (upcoming.find((e) => e.id === forEvent) ?? upcoming.find(inSeries));
  const start = target ? target.startDate : customStart;
  const end = target ? target.endDate : customEnd;
  const total = (record: Record<string, number>) => Object.values(record).reduce((s, n) => s + n, 0);
  const peakOf = (record: Record<string, number>) => Math.max(0, ...Object.values(record));
  const rows = events.map((e) => ({
    ...e,
    roles: eventRoles(e.startDate, e.endDate, e.pickedUp),
    blockRoles: eventRoles(e.startDate, e.endDate, e.blocked),
    roomNights: total(e.pickedUp),
    blockNights: total(e.blocked),
    peak: peakOf(e.pickedUp),
    blockPeak: peakOf(e.blocked),
  }));
  const stats = patternStats(events);
  const { roles, average, highest, averageBlock, highestBlock, shape, observedMiddle } = stats;
  const mean = (ns: number[]) => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0);
  const max = (ns: number[]) => Math.max(0, ...ns);
  const proposed = proposedRoles(stats, basis, adjust);
  const dated = start && end && end >= start ? proposeNights(start, end, proposed, observedMiddle) : null;
  // A new RFP for the target event, its first block filled from this pattern.
  const rfpHref = (eventId: string) => {
    const q = new URLSearchParams({ basis, adjust: String(adjust) });
    if (filters.seriesId && filters.seriesId !== "__blank__") q.set("series", filters.seriesId);
    if (valid.contractTypes.length === 1) q.set("contract", valid.contractTypes[0]);
    if (valid.guestTypes.length === 1) q.set("guest", valid.guestTypes[0]);
    if (filters.city) q.set("city", filters.city);
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    return `/events/${eventId}/hotels/rfps/new?${q.toString()}`;
  };
  const adjustLabel = adjust ? ` (${adjust > 0 ? "+" : ""}${adjust}%)` : "";

  const csvRow = (label: string, dates: string, values: Map<string, number>, roomNights: number | null, peak: number | null) => ({
    Row: label,
    Dates: dates,
    ...Object.fromEntries(roles.map((role) => [roleLabel(role), values.has(role) ? Math.round(values.get(role)!) : null])),
    "Room nights": roomNights == null ? null : Math.round(roomNights),
    Peak: peak == null ? null : Math.round(peak),
  });
  const csv = [
    ...rows.flatMap((r) => [
      csvRow(r.name, `${r.startDate} – ${r.endDate}`, r.roles, r.roomNights, r.peak),
      ...(showBlock ? [csvRow(`${r.name} (block)`, `${r.startDate} – ${r.endDate}`, r.blockRoles, r.blockNights, r.blockPeak)] : []),
    ]),
    csvRow("Average", "", average, mean(rows.map((r) => r.roomNights)), mean(rows.map((r) => r.peak))),
    ...(showBlock ? [csvRow("Average (block)", "", averageBlock, mean(rows.map((r) => r.blockNights)), mean(rows.map((r) => r.blockPeak)))] : []),
    csvRow("Highest", "", highest, max(rows.map((r) => r.roomNights)), max(rows.map((r) => r.peak))),
    ...(showBlock ? [csvRow("Highest (block)", "", highestBlock, max(rows.map((r) => r.blockNights)), max(rows.map((r) => r.blockPeak)))] : []),
    csvRow("Pattern %", "", shape, null, null),
  ];
  const proposedCsv = dated
    ? dated.map((d) => ({ Night: d.night, Offset: offsetLabel(d.offset), Rooms: Math.round(d.rooms), Estimate: d.estimate ? "Yes" : "" }))
    : roles.flatMap((role) => (proposed.has(role) ? [{ Night: roleLabel(role), Rooms: proposed.get(role)! }] : []));

  const num = `${reportTd} text-right tabular-nums`;
  const muted = "text-gray-400 dark:text-gray-500";
  // Pickup, with the block beneath it when shown.
  const cell = (pickup: number | undefined, block: number | undefined, blank: string | number) => (
    <>
      <div className={pickup ? "" : muted}>{pickup == null ? blank : Math.round(pickup)}</div>
      {showBlock && <div className={`text-xs ${muted}`}>{block == null ? blank : Math.round(block)}</div>}
    </>
  );
  const summaryRow = (
    label: string,
    values: Map<string, number>,
    blocks: Map<string, number> | null,
    fmt: (n: number) => string | number,
    totals: [number, number, number, number] | null,
  ) => (
    <tr className="bg-gray-50 dark:bg-gray-900/40">
      <td className={reportTd}>{label}</td>
      {roles.map((role) => (
        <td key={role} className={num}>
          <div>{values.has(role) ? fmt(values.get(role)!) : "—"}</div>
          {showBlock && blocks && <div className={`text-xs ${muted}`}>{blocks.has(role) ? Math.round(blocks.get(role)!) : "—"}</div>}
        </td>
      ))}
      <td className={num}>{totals && cell(totals[0], totals[2], "")}</td>
      <td className={num}>{totals && cell(totals[1], totals[3], "")}</td>
    </tr>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <PatternFilterBar series={series} cities={cities} guestTypes={guestTypes} />
        <CsvButton fileName="hotel-rfp-pattern.csv" rows={csv} />
      </div>
      {noPickup.length > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          No pickup on file: {noPickup.map((e) => e.name).join(", ")}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No ended events with pickup.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Actual pickup{showBlock && " / block"}</h2>
            <ShowBlockToggle />
          </div>
          <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow rounded-lg">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={reportTh}>Event</th>
                  {roles.map((role) => (
                    <th key={role} className={`${reportTh} text-right whitespace-nowrap`}>
                      {roleLabel(role)}
                    </th>
                  ))}
                  <th className={`${reportTh} text-right`}>Room nights</th>
                  <th className={`${reportTh} text-right`}>Peak</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={reportTd}>
                      <Link href={`/events/${r.id}/hotels`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-gray-500 dark:text-gray-400 whitespace-nowrap" title={r.hotels.join("\n")}>
                        {formatNight(r.startDate)} – {formatNight(r.endDate)} · {r.hotels.length} hotel{r.hotels.length === 1 ? "" : "s"}
                      </div>
                    </td>
                    {roles.map((role) => (
                      <td key={role} className={num}>
                        {cell(r.roles.get(role), r.blockRoles.get(role), role === "middle" ? "—" : 0)}
                      </td>
                    ))}
                    <td className={num}>{cell(r.roomNights, r.blockNights, 0)}</td>
                    <td className={num}>{cell(r.peak, r.blockPeak, 0)}</td>
                  </tr>
                ))}
                {summaryRow("Average", average, averageBlock, Math.round, [
                  mean(rows.map((r) => r.roomNights)),
                  mean(rows.map((r) => r.peak)),
                  mean(rows.map((r) => r.blockNights)),
                  mean(rows.map((r) => r.blockPeak)),
                ])}
                {summaryRow("Highest", highest, highestBlock, (n) => n, [
                  max(rows.map((r) => r.roomNights)),
                  max(rows.map((r) => r.peak)),
                  max(rows.map((r) => r.blockNights)),
                  max(rows.map((r) => r.blockPeak)),
                ])}
                {summaryRow("Pattern %", shape, null, (n) => `${n}%`, null)}
              </tbody>
            </table>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Proposed block{adjustLabel}
                {target && ` · ${target.name}`}
                {dated && ` · ${formatNight(start!)} – ${formatNight(end!)}`}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                {target && dated && (
                  <Link href={rfpHref(target.id)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    Use in RFP
                  </Link>
                )}
                <CsvButton fileName={dated ? `hotel-rfp-block-${start}.csv` : "hotel-rfp-block.csv"} rows={proposedCsv} />
              </div>
            </div>
            <ProposalControls events={upcoming} selected={target?.id ?? "custom"} />
            <div className="mt-3 max-w-md bg-white dark:bg-gray-800 shadow rounded-lg">
              <table className="min-w-full">
                <thead>
                  <tr>
                    {dated && <th className={reportTh}>Night</th>}
                    <th className={reportTh}>{dated ? "Offset" : "Night"}</th>
                    <th className={`${reportTh} text-right`}>Rooms</th>
                  </tr>
                </thead>
                <tbody>
                  {dated
                    ? dated.map((d) => (
                        <tr key={d.night}>
                          <td className={`${reportTd} whitespace-nowrap`}>{formatNight(d.night)}</td>
                          <td className={`${reportTd} whitespace-nowrap tabular-nums`}>{offsetLabel(d.offset)}</td>
                          <td className={`${num} ${d.estimate ? `italic ${muted}` : ""}`} title={d.estimate ? "Estimate" : undefined}>
                            {d.estimate && "~"}
                            {Math.round(d.rooms)}
                          </td>
                        </tr>
                      ))
                    : roles.map((role) =>
                        proposed.has(role) ? (
                          <tr key={role}>
                            <td className={`${reportTd} whitespace-nowrap`}>{roleLabel(role)}</td>
                            <td className={num}>{proposed.get(role)}</td>
                          </tr>
                        ) : null,
                      )}
                  {dated && (
                    <tr className="bg-blue-50 dark:bg-blue-900/30 font-semibold">
                      <td className={`${reportTd} text-blue-700 dark:text-blue-300`} colSpan={2}>
                        Room nights
                      </td>
                      <td className={num}>{dated.reduce((s, d) => s + Math.round(d.rooms), 0)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default async function HotelReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    series?: string;
    from?: string;
    to?: string;
    byHotel?: string;
    city?: string;
    contract?: string;
    guest?: string;
    basis?: string;
    adjust?: string;
    start?: string;
    end?: string;
    for?: string;
    block?: string;
  }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "monitoring" || sp.view === "pattern" ? sp.view : "history";
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  const adjust = Number.parseInt(sp.adjust ?? "", 10);
  return (
    <PageWrapper>
      <PageHeader breadcrumbs={[{ label: "Hotels", href: "/hotels" }, { label: "Reports" }]} title="Hotel Reports" />
      <Tabs view={view} />
      {view === "monitoring" ? (
        <Monitoring />
      ) : view === "pattern" ? (
        <Pattern
          filters={{ seriesId: sp.series || undefined, city: sp.city || undefined, contractTypes: parseContractTypes(sp.contract), guestTypes: sp.guest ? [sp.guest] : [], from, to }}
          basis={sp.basis === "highest" || sp.basis === "latest" ? sp.basis : "average"}
          adjust={Number.isFinite(adjust) ? Math.min(200, Math.max(-90, adjust)) : 0}
          forEvent={sp.for || undefined}
          customStart={sp.start && DATE_RE.test(sp.start) ? sp.start : undefined}
          customEnd={sp.end && DATE_RE.test(sp.end) ? sp.end : undefined}
          showBlock={sp.block === "1"}
        />
      ) : (
        <History seriesId={sp.series || undefined} from={from} to={to} byHotel={sp.byHotel === "1"} />
      )}
    </PageWrapper>
  );
}
