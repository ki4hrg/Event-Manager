import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { reportFooterText, reportSectionCardCompact as cardClass, reportTd, reportTh } from "@/lib/reportStyles";
import type { EsgDocument, EsgScheduleRow } from "@/lib/esg/types";
import { EsgSectionView } from "./EsgBlocks";

// APEX Event Specifications Guide: Part I (Narrative), Part II (Function
// Schedule), Part IIIa (Function Set-up Orders). Renders the normalized
// EsgDocument only, so the authenticated page, print route and share views
// all show the same thing.

function groupByDay(rows: EsgScheduleRow[]) {
  const days: { dateKey: string; label: string; rows: EsgScheduleRow[] }[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last && last.dateKey === row.dateKey) last.rows.push(row);
    else days.push({ dateKey: row.dateKey, label: row.dayDate, rows: [row] });
  }
  return days;
}

function FunctionSchedule({ rows }: { rows: EsgScheduleRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No scheduled functions.</p>;
  }
  const days = groupByDay(rows);
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day.dateKey} className="print:break-inside-avoid">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white print:text-black mb-2">{day.label}</h3>
          <ul className="sm:hidden print:hidden space-y-2">
            {day.rows.map((r, i) => (
              <li key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {r.number && <span className="text-gray-500 dark:text-gray-400 mr-1">#{r.number}</span>}
                    {r.name}
                  </p>
                  {r.setFor && <span className="text-gray-600 dark:text-gray-400 tabular-nums shrink-0">{r.setFor}</span>}
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                  {r.start} – {r.end}
                </p>
                <p className="text-gray-600 dark:text-gray-400">{[r.facility, r.room].filter(Boolean).join(" — ")}</p>
                {r.setup && <p className="text-gray-600 dark:text-gray-400">Set-up: {r.setup}</p>}
                {(r.posting || r.hold24) && (
                  <p className="italic text-gray-500 dark:text-gray-400">
                    {[r.posting, r.hold24 ? "24-hour hold" : null].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="hidden sm:block print:block overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={reportTh}>Start</th>
                  <th className={reportTh}>End</th>
                  <th className={reportTh}>Function #</th>
                  <th className={reportTh}>Function name</th>
                  <th className={reportTh}>Facility</th>
                  <th className={reportTh}>Room</th>
                  <th className={reportTh}>Set-up</th>
                  <th className={`${reportTh} text-right`}>Set for</th>
                  <th className={reportTh}>Posting</th>
                  <th className={reportTh}>24-hr hold</th>
                </tr>
              </thead>
              <tbody>
                {day.rows.map((r, i) => (
                  <tr key={i}>
                    <td className={`${reportTd} whitespace-nowrap`}>{r.start}</td>
                    <td className={`${reportTd} whitespace-nowrap`}>{r.end}</td>
                    <td className={reportTd}>{r.number ?? ""}</td>
                    <td className={reportTd}>{r.name}</td>
                    <td className={reportTd}>{r.facility ?? ""}</td>
                    <td className={reportTd}>{r.room ?? ""}</td>
                    <td className={reportTd}>{r.setup ?? ""}</td>
                    <td className={`${reportTd} text-right tabular-nums`}>{r.setFor ?? ""}</td>
                    <td className={reportTd}>{r.posting ?? ""}</td>
                    <td className={reportTd}>{r.hold24 ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EsgReport({ doc }: { doc: EsgDocument }) {
  const { meta } = doc;
  const sections = [
    ...(doc.narrative ? [{ id: "narrative", label: "Part I — Narrative" }] : []),
    ...(doc.functionSchedule ? [{ id: "function-schedule", label: "Part II — Function Schedule" }] : []),
    ...(doc.setupOrders ? [{ id: "setup-orders", label: "Part IIIa — Set-up Orders" }] : []),
    ...(doc.boothOrders ? [{ id: "booth-orders", label: "Part IIIb — Booth Set-up Orders" }] : []),
  ];
  const itemGroups = [
    ...(doc.narrative
      ? [
          {
            label: "Narrative sections",
            links: doc.narrative.sections.map((s) => ({ id: `section-${s.letter.toLowerCase()}`, label: `${s.letter}. ${s.title}` })),
          },
        ]
      : []),
    ...(doc.setupOrders && doc.setupOrders.length > 0
      ? [
          {
            label: "Set-up orders",
            links: doc.setupOrders.map((o) => ({ id: o.anchor, label: `${o.number ? `#${o.number} · ` : ""}${o.name}` })),
          },
        ]
      : []),
    ...(doc.boothOrders && doc.boothOrders.length > 0
      ? [
          {
            label: "Booths",
            links: doc.boothOrders.map((o) => ({ id: o.anchor, label: `${o.number ? `Booth ${o.number} · ` : ""}${o.name}` })),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <ReportNav sections={sections} itemGroups={itemGroups} />

      <div id="summary" className={`${cardClass} scroll-mt-24`}>
        <dl className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Event</dt>
            <dd className="text-gray-900 dark:text-white print:text-black font-medium">{meta.eventName}</dd>
            <dd className="text-gray-600 dark:text-gray-400">{meta.eventDates}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Organizer / host · contact</dt>
            <dd className="text-gray-900 dark:text-white print:text-black">{meta.organizer ?? "—"}</dd>
            <dd className="text-gray-600 dark:text-gray-400">
              {[meta.contactName, meta.contactPhone].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Date originated · revised</dt>
            <dd className="text-gray-900 dark:text-white print:text-black">{meta.dateOriginated ?? "Not issued"}</dd>
            <dd className="text-gray-600 dark:text-gray-400">{meta.dateRevised ? `Revised ${meta.dateRevised}` : "—"}</dd>
          </div>
        </dl>
      </div>

      {doc.narrative && (
        <>
          <SectionDivider id="narrative" title="Part I — Narrative" />
          <div className={`${cardClass} space-y-6`}>
            {doc.narrative.sections.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Nothing captured yet.</p>
            ) : (
              doc.narrative.sections.map((s) => (
                <EsgSectionView key={s.letter} id={`section-${s.letter.toLowerCase()}`} section={s} />
              ))
            )}
          </div>
        </>
      )}

      {doc.functionSchedule && (
        <>
          <div className="print:break-before-page" />
          <SectionDivider id="function-schedule" title="Part II — Function Schedule" />
          <div className={cardClass}>
            <FunctionSchedule rows={doc.functionSchedule} />
          </div>
        </>
      )}

      {doc.setupOrders && (
        <>
          <SectionDivider id="setup-orders" title="Part IIIa — Function Set-up Orders" />
          {doc.setupOrders.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No functions match the current filters.</p>
          )}
          {doc.setupOrders.map((o) => (
            <div key={o.anchor} id={o.anchor} className={`${cardClass} scroll-mt-24 print:break-before-page space-y-5`}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white print:text-black">
                {o.number && <span className="text-gray-500 dark:text-gray-400 print:text-gray-600 mr-2">#{o.number}</span>}
                {o.name}
              </h3>
              {o.sections.map((s) => (
                <EsgSectionView key={s.letter} section={s} />
              ))}
            </div>
          ))}
        </>
      )}

      {doc.boothOrders && (
        <>
          <SectionDivider id="booth-orders" title="Part IIIb — Booth Set-up Orders" />
          {doc.boothOrders.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No booths.</p>}
          {doc.boothOrders.map((o) => (
            <div key={o.anchor} id={o.anchor} className={`${cardClass} scroll-mt-24 print:break-before-page space-y-5`}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white print:text-black">
                {o.number && <span className="text-gray-500 dark:text-gray-400 print:text-gray-600 mr-2">Booth {o.number}</span>}
                {o.name}
              </h3>
              {o.sections.map((s) => (
                <EsgSectionView key={s.letter} section={s} />
              ))}
            </div>
          ))}
        </>
      )}

      <p className={`${reportFooterText} pt-2`}>
        {doc.attribution} Generated {meta.generatedAt}.
      </p>
    </div>
  );
}
