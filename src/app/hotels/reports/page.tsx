import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { reportTd, reportTh } from "@/lib/reportStyles";
import { BLOCK_TYPE_LABELS, formatDateKey } from "@/lib/hotels";
import { getBlockMonitoring, getHotelPickupHistory, getSeriesChoices } from "../actions";
import { CsvButton, HotelReportFilters } from "./HotelReportFilters";

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

export default async function HotelReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; series?: string; from?: string; to?: string; byHotel?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "monitoring" ? "monitoring" : "history";
  return (
    <PageWrapper>
      <PageHeader breadcrumbs={[{ label: "Hotels", href: "/hotels" }, { label: "Reports" }]} title="Hotel Reports" />
      <Tabs view={view} />
      {view === "monitoring" ? (
        <Monitoring />
      ) : (
        <History
          seriesId={sp.series || undefined}
          from={sp.from && DATE_RE.test(sp.from) ? sp.from : undefined}
          to={sp.to && DATE_RE.test(sp.to) ? sp.to : undefined}
          byHotel={sp.byHotel === "1"}
        />
      )}
    </PageWrapper>
  );
}
