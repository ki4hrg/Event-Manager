import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { reportTd, reportTh } from "@/lib/reportStyles";
import { BLOCK_TYPE_LABELS, dateFromKey, dateKey, formatDateKey, formatNight, parseBlockTypes } from "@/lib/hotels";
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

const offsetLabel = (o: number) => (o === 0 ? "Start" : `Start ${o > 0 ? "+" : "−"}${Math.abs(o)}`);
const round1 = (n: number) => Math.round(n * 10) / 10;

async function Pattern({ filters, basis, adjust, start }: { filters: PatternFilters; basis: Basis; adjust: number; start?: string }) {
  const [{ events, noPickup }, series, cities] = await Promise.all([getPickupPattern(filters), getSeriesChoices(), getHotelCities()]);
  const offsets = Array.from(new Set(events.flatMap((e) => Object.keys(e.nights).map(Number)))).sort((a, b) => a - b);
  const picked = (e: (typeof events)[number], o: number) => e.nights[o]?.pickedUp ?? 0;
  const average = offsets.map((o) => (events.length ? events.reduce((s, e) => s + picked(e, o), 0) / events.length : 0));
  const highest = offsets.map((o) => Math.max(0, ...events.map((e) => picked(e, o))));
  const latest = offsets.map((o) => (events[0] ? picked(events[0], o) : 0));
  const base = basis === "highest" ? highest : basis === "latest" ? latest : average;
  const proposed = base.map((n) => Math.max(0, Math.round(n * (1 + adjust / 100))));
  const avgPeak = Math.max(0, ...average);
  const shape = average.map((n) => (avgPeak ? Math.round((n / avgPeak) * 100) : 0));
  const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);
  const newNight = (o: number) => (start ? dateKey(new Date(dateFromKey(start).getTime() + o * 86_400_000)) : null);

  const csvRow = (label: string, values: number[], extra: Record<string, string | number | null> = {}) => ({
    Row: label,
    ...extra,
    ...Object.fromEntries(offsets.map((o, i) => [newNight(o) ?? offsetLabel(o), values[i]])),
    "Room nights": round1(sum(values)),
    Peak: round1(Math.max(0, ...values)),
  });
  const csv = [
    ...events.map((e) => csvRow(e.name, offsets.map((o) => picked(e, o)), { Start: e.startDate })),
    csvRow("Average", average.map(round1), { Start: null }),
    csvRow("Highest", highest, { Start: null }),
    csvRow("Pattern %", shape, { Start: null }),
    csvRow("Proposed", proposed, { Start: start ?? null }),
  ];

  const num = `${reportTd} text-right tabular-nums`;
  const summaryRow = (label: string, values: number[], fmt: (n: number) => string | number = (n) => n, opts: { strong?: boolean; totals?: boolean } = {}) => {
    const { strong = false, totals = true } = opts;
    return (
    <tr className={strong ? "bg-blue-50 dark:bg-blue-900/30 font-semibold" : "bg-gray-50 dark:bg-gray-900/40"}>
      <td className={`${reportTd} ${strong ? "text-blue-700 dark:text-blue-300" : ""}`}>{label}</td>
      {values.map((n, i) => (
        <td key={offsets[i]} className={num}>
          {fmt(n)}
        </td>
      ))}
      <td className={num}>{totals ? fmt(round1(sum(values))) : ""}</td>
      <td className={num}>{totals ? fmt(round1(Math.max(0, ...values))) : ""}</td>
    </tr>
    );
  };

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
      {events.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No ended events with pickup.</p>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow rounded-lg">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={reportTh}>Event</th>
                {offsets.map((o) => (
                  <th key={o} className={`${reportTh} text-right whitespace-nowrap`}>
                    {offsetLabel(o)}
                    {start && <div className="font-normal normal-case">{formatNight(newNight(o)!)}</div>}
                  </th>
                ))}
                <th className={`${reportTh} text-right`}>Room nights</th>
                <th className={`${reportTh} text-right`}>Peak</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const values = offsets.map((o) => picked(e, o));
                return (
                  <tr key={e.id}>
                    <td className={reportTd}>
                      <Link href={`/events/${e.id}/hotels`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {e.name}
                      </Link>
                      <div className="text-gray-500 dark:text-gray-400" title={e.hotels.join("\n")}>
                        {formatNight(e.startDate)} · {e.hotels.length} hotel{e.hotels.length === 1 ? "" : "s"}
                      </div>
                    </td>
                    {offsets.map((o, i) => (
                      <td
                        key={o}
                        className={`${num} ${values[i] === 0 ? "text-gray-400 dark:text-gray-500" : ""}`}
                        title={e.nights[o] ? `${formatNight(e.nights[o].night)} · ${e.nights[o].blocked} blocked` : undefined}
                      >
                        {values[i]}
                      </td>
                    ))}
                    <td className={num}>{sum(values)}</td>
                    <td className={num}>{Math.max(0, ...values)}</td>
                  </tr>
                );
              })}
              {summaryRow("Average", average, (n) => round1(n))}
              {summaryRow("Highest", highest)}
              {summaryRow("Pattern %", shape, (n) => `${n}%`, { totals: false })}
              {summaryRow(`Proposed${adjust ? ` (${adjust > 0 ? "+" : ""}${adjust}%)` : ""}`, proposed, (n) => n, { strong: true })}
            </tbody>
          </table>
        </div>
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
        />
      ) : (
        <History seriesId={sp.series || undefined} from={from} to={to} byHotel={sp.byHotel === "1"} />
      )}
    </PageWrapper>
  );
}
