import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { reportTd, reportTh } from "@/lib/reportStyles";
import { BLOCK_TYPE_LABELS, formatDateKey, formatNight, parseBlockTypes } from "@/lib/hotels";
import { eventRoles, offsetLabel, proposeNights, roleLabel, sortRoles } from "@/lib/hotelPattern";
import { getBlockMonitoring, getHotelCities, getHotelPickupHistory, getPickupPattern, getSeriesChoices, type PatternFilters } from "../actions";
import { CsvButton, HotelReportFilters, PatternFilters as PatternFilterBar } from "./HotelReportFilters";

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
                          {h.blockType && <span className="text-gray-500 dark:text-gray-400"> · {BLOCK_TYPE_LABELS[h.blockType]}</span>}
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

type Basis = "average" | "highest" | "latest";


async function Pattern({
  filters,
  basis,
  adjust,
  start,
  end,
}: {
  filters: PatternFilters;
  basis: Basis;
  adjust: number;
  start?: string;
  end?: string;
}) {
  const [{ events, noPickup }, series, cities] = await Promise.all([getPickupPattern(filters), getSeriesChoices(), getHotelCities()]);
  const rows = events.map((e) => {
    const nights = Object.values(e.pickedUp);
    return { ...e, roles: eventRoles(e.startDate, e.endDate, e.pickedUp), roomNights: nights.reduce((s, n) => s + n, 0), peak: Math.max(0, ...nights) };
  });
  const roles = sortRoles(rows.flatMap((r) => Array.from(r.roles.keys())));
  // Middle only counts events long enough to have one; any other role an
  // event lacks had no rooms that night.
  const valuesFor = (role: string) => rows.flatMap((r) => (r.roles.has(role) ? [r.roles.get(role)!] : role === "middle" ? [] : [0]));
  const mean = (ns: number[]) => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0);
  const average = new Map(roles.map((role) => [role, mean(valuesFor(role))]));
  const highest = new Map(roles.map((role) => [role, Math.max(0, ...valuesFor(role))]));
  const latest = new Map(roles.flatMap((role) => (rows[0]?.roles.has(role) || role !== "middle" ? [[role, rows[0]?.roles.get(role) ?? 0] as const] : [])));
  const base = basis === "highest" ? highest : basis === "latest" ? latest : average;
  const proposed = new Map(Array.from(base, ([role, n]) => [role, Math.max(0, Math.round(n * (1 + adjust / 100)))]));
  const avgPeak = Math.max(0, ...Array.from(average.values()));
  const shape = new Map(Array.from(average, ([role, n]) => [role, avgPeak ? Math.round((n / avgPeak) * 100) : 0]));
  const dated = start && end && end >= start ? proposeNights(start, end, proposed) : null;
  const adjustLabel = adjust ? ` (${adjust > 0 ? "+" : ""}${adjust}%)` : "";

  const csvRow = (label: string, dates: string, values: Map<string, number>, roomNights: number | null, peak: number | null) => ({
    Row: label,
    Dates: dates,
    ...Object.fromEntries(roles.map((role) => [roleLabel(role), values.has(role) ? Math.round(values.get(role)!) : null])),
    "Room nights": roomNights == null ? null : Math.round(roomNights),
    Peak: peak == null ? null : Math.round(peak),
  });
  const csv = [
    ...rows.map((r) => csvRow(r.name, `${r.startDate} – ${r.endDate}`, r.roles, r.roomNights, r.peak)),
    csvRow("Average", "", average, mean(rows.map((r) => r.roomNights)), mean(rows.map((r) => r.peak))),
    csvRow("Highest", "", highest, Math.max(0, ...rows.map((r) => r.roomNights)), Math.max(0, ...rows.map((r) => r.peak))),
    csvRow("Pattern %", "", shape, null, null),
    csvRow(`Proposed${adjustLabel}`, "", proposed, null, null),
  ];

  const num = `${reportTd} text-right tabular-nums`;
  const summaryRow = (
    label: string,
    values: Map<string, number>,
    fmt: (n: number) => string | number,
    totals: [number, number] | null,
    strong = false,
  ) => (
    <tr className={strong ? "bg-blue-50 dark:bg-blue-900/30 font-semibold" : "bg-gray-50 dark:bg-gray-900/40"}>
      <td className={`${reportTd} ${strong ? "text-blue-700 dark:text-blue-300" : ""}`}>{label}</td>
      {roles.map((role) => (
        <td key={role} className={num}>
          {values.has(role) ? fmt(values.get(role)!) : "—"}
        </td>
      ))}
      <td className={num}>{totals ? Math.round(totals[0]) : ""}</td>
      <td className={num}>{totals ? Math.round(totals[1]) : ""}</td>
    </tr>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <PatternFilterBar series={series} cities={cities} />
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
                    {roles.map((role) => {
                      const n = r.roles.get(role);
                      return (
                        <td key={role} className={`${num} ${!n ? "text-gray-400 dark:text-gray-500" : ""}`}>
                          {n == null ? (role === "middle" ? "—" : 0) : Math.round(n)}
                        </td>
                      );
                    })}
                    <td className={num}>{r.roomNights}</td>
                    <td className={num}>{r.peak}</td>
                  </tr>
                ))}
                {summaryRow("Average", average, Math.round, [mean(rows.map((r) => r.roomNights)), mean(rows.map((r) => r.peak))])}
                {summaryRow("Highest", highest, (n) => n, [Math.max(0, ...rows.map((r) => r.roomNights)), Math.max(0, ...rows.map((r) => r.peak))])}
                {summaryRow("Pattern %", shape, (n) => `${n}%`, null)}
                {summaryRow(`Proposed${adjustLabel}`, proposed, (n) => n, null, true)}
              </tbody>
            </table>
          </div>
          {dated && (
            <div className="mt-6 max-w-md">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Proposed block · {formatNight(start!)} – {formatNight(end!)}
                </h2>
                <CsvButton
                  fileName={`hotel-rfp-block-${start}.csv`}
                  rows={dated.map((d) => ({ Night: d.night, Offset: offsetLabel(d.offset), Role: roleLabel(d.role), Rooms: Math.round(d.rooms) }))}
                />
              </div>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={reportTh}>Night</th>
                      <th className={reportTh}>Offset</th>
                      <th className={reportTh}>Role</th>
                      <th className={`${reportTh} text-right`}>Rooms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dated.map((d) => (
                      <tr key={d.night}>
                        <td className={`${reportTd} whitespace-nowrap`}>{formatNight(d.night)}</td>
                        <td className={`${reportTd} whitespace-nowrap tabular-nums`}>{offsetLabel(d.offset)}</td>
                        <td className={`${reportTd} text-gray-500 dark:text-gray-400`}>{roleLabel(d.role)}</td>
                        <td className={num}>{Math.round(d.rooms)}</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-50 dark:bg-blue-900/30 font-semibold">
                      <td className={`${reportTd} text-blue-700 dark:text-blue-300`} colSpan={3}>
                        Room nights
                      </td>
                      <td className={num}>{dated.reduce((s, d) => s + Math.round(d.rooms), 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
    types?: string;
    basis?: string;
    adjust?: string;
    start?: string;
    end?: string;
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
          filters={{ seriesId: sp.series || undefined, city: sp.city || undefined, blockTypes: parseBlockTypes(sp.types), from, to }}
          basis={sp.basis === "highest" || sp.basis === "latest" ? sp.basis : "average"}
          adjust={Number.isFinite(adjust) ? Math.min(200, Math.max(-90, adjust)) : 0}
          start={sp.start && DATE_RE.test(sp.start) ? sp.start : undefined}
          end={sp.end && DATE_RE.test(sp.end) ? sp.end : undefined}
        />
      ) : (
        <History seriesId={sp.series || undefined} from={from} to={to} byHotel={sp.byHotel === "1"} />
      )}
    </PageWrapper>
  );
}
