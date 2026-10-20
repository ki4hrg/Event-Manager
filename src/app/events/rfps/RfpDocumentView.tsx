import type { ReactNode } from "react";
import { formatNight } from "@/lib/hotels";
import { labelMicroCaps, reportSectionCard, reportTd, reportTh } from "@/lib/reportStyles";
import type { RfpDocument } from "@/lib/rfp/document";

// The RFP document on screen and on the /print route. Same RfpDocument the
// .docx renders; every table has a mobile card layout.

const richClass =
  "text-sm text-gray-900 dark:text-white print:text-black [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1";
const num = `${reportTd} text-right tabular-nums`;
const muted = "text-sm text-gray-500 dark:text-gray-400 print:text-gray-600";
const card = "print:hidden sm:hidden border border-gray-200 dark:border-gray-700 rounded-lg p-3";
const desktop = "hidden sm:block print:block overflow-x-auto print:overflow-visible";
const round = (n: number | null) => (n == null ? "" : Math.round(n));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={reportSectionCard}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Rich({ html }: { html: string }) {
  // HTML from RichTextEditor (Rfp.introduction / Rfp.requirements).
  return <div className={richClass} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function RfpDocumentView({ doc }: { doc: RfpDocument }) {
  const { meta } = doc;
  const facts: [string, ReactNode][] = [
    ["Event", `${meta.eventName} · ${meta.eventDates}`],
    ...(meta.location ? [["Location", meta.location] as [string, ReactNode]] : []),
    ...(meta.expectedAttendance != null ? [["Expected attendance", meta.expectedAttendance] as [string, ReactNode]] : []),
    ["Responses due", meta.responseDue ?? "—"],
    ...(meta.decisionBy ? [["Decision by", meta.decisionBy] as [string, ReactNode]] : []),
    [
      "Contact",
      meta.contact ? (
        <span className="whitespace-pre-line">
          {[meta.contact.name, meta.contact.title, meta.contact.organization, meta.contact.email, meta.contact.phone].filter(Boolean).join("\n")}
        </span>
      ) : (
        "—"
      ),
    ],
  ];

  return (
    <div className="space-y-6 print:space-y-4">
      <section className={reportSectionCard}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className={labelMicroCaps}>{label}</dt>
              <dd className="text-gray-900 dark:text-white print:text-black">{value}</dd>
            </div>
          ))}
        </dl>
        {doc.introduction && (
          <div className="mt-4">
            <Rich html={doc.introduction} />
          </div>
        )}
      </section>

      {doc.blocks && (
        <Section title="Room blocks">
          {doc.blocks.length === 0 && <p className={muted}>No room blocks requested.</p>}
          <div className="space-y-6">
            {doc.blocks.map((b, i) => (
              <div key={i} className="print:break-inside-avoid">
                <p className="text-sm font-semibold text-gray-900 dark:text-white print:text-black">{b.label}</p>
                <p className={`${muted} mb-2`}>
                  {[b.isRunOfHouse ? "Run of house" : null, `Peak ${b.peak}`, `${b.roomNights} room nights`, b.targetRate ? `Target rate ${b.targetRate}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {b.nights.length > 0 && (
                  <>
                    <div className="sm:hidden print:hidden divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                      {b.nights.map((k) => (
                        <div key={k} className="flex justify-between gap-3 px-3 py-2 text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">{formatNight(k)}</span>
                          <span className="text-right text-gray-700 dark:text-gray-300">
                            {b.rows.length > 1 && (
                              <span className="block text-xs text-gray-500 dark:text-gray-400">
                                {b.rows.map((r) => `${r.roomType} ${r.rooms[k] ?? 0}`).join(" · ")}
                              </span>
                            )}
                            {b.totals[k]} rooms
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={desktop}>
                      <table className="min-w-full">
                        <thead>
                          <tr>
                            <th className={reportTh}>Room type</th>
                            {b.nights.map((k) => (
                              <th key={k} className={`${reportTh} text-right`}>
                                {formatNight(k)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {b.rows.map((r) => (
                            <tr key={r.roomType}>
                              <td className={reportTd}>{r.roomType}</td>
                              {b.nights.map((k) => (
                                <td key={k} className={num}>
                                  {r.rooms[k] ?? 0}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {b.rows.length > 1 && (
                            <tr className="font-semibold">
                              <td className={reportTd}>Total</td>
                              {b.nights.map((k) => (
                                <td key={k} className={num}>
                                  {b.totals[k]}
                                </td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {b.notes && <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{b.notes}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {doc.meetingSpace && (
        <Section title="Meeting space">
          {doc.meetingSpace.rows.length === 0 ? (
            <p className={muted}>No on-site functions scheduled.</p>
          ) : (
            <>
              <div className="sm:hidden print:hidden space-y-2">
                {doc.meetingSpace.rows.map((r, i) => (
                  <div key={i} className={card}>
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{r.name}</p>
                      {r.attendance != null && <p className="text-sm text-gray-900 dark:text-white tabular-nums">{r.attendance}</p>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatNight(r.date)} · {r.time}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[r.type, r.setup, r.hold24 ? "24-hr hold" : null, doc.meetingSpace!.showRoomNames ? r.room : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
              <div className={desktop}>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={reportTh}>Date</th>
                      <th className={reportTh}>Time</th>
                      <th className={reportTh}>Function</th>
                      <th className={reportTh}>Type</th>
                      <th className={reportTh}>Set-up</th>
                      <th className={`${reportTh} text-right`}>Attendance</th>
                      <th className={reportTh}>24-hr hold</th>
                      {doc.meetingSpace.showRoomNames && <th className={reportTh}>Room</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {doc.meetingSpace.rows.map((r, i) => (
                      <tr key={i}>
                        <td className={`${reportTd} whitespace-nowrap`}>{formatNight(r.date)}</td>
                        <td className={`${reportTd} whitespace-nowrap`}>{r.time}</td>
                        <td className={reportTd}>{r.name}</td>
                        <td className={reportTd}>{r.type}</td>
                        <td className={reportTd}>{r.setup}</td>
                        <td className={num}>{round(r.attendance)}</td>
                        <td className={reportTd}>{r.hold24 ? "Yes" : ""}</td>
                        {doc.meetingSpace!.showRoomNames && <td className={reportTd}>{r.room}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      )}

      {doc.fb && (
        <Section title="Food & beverage">
          {(() => {
            const fb = doc.fb!;
            const active = fb.rows.filter((r) => Object.keys(r.cells).length > 0);
            if (active.length === 0) return <p className={muted}>No catered functions.</p>;
            return (
              <>
                <div className="sm:hidden print:hidden space-y-2">
                  {fb.days.map((d) => (
                    <div key={d} className={card}>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{formatNight(d)}</p>
                      {active
                        .filter((r) => r.cells[d])
                        .map((r) => (
                          <div key={r.key} className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                            <span>{r.label}</span>
                            <span className="tabular-nums">{r.cells[d].expected}</span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
                <div className={desktop}>
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={reportTh}>Meal</th>
                        {fb.days.map((d) => (
                          <th key={d} className={`${reportTh} text-right`}>
                            {formatNight(d)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((r) => (
                        <tr key={r.key}>
                          <td className={reportTd}>{r.label}</td>
                          {fb.days.map((d) => (
                            <td key={d} className={num}>
                              {r.cells[d]?.expected ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={`${muted} mt-2`}>Expected attendance per meal.</p>
              </>
            );
          })()}
        </Section>
      )}

      {doc.concessions && (
        <Section title="Concessions">
          {doc.concessions.length === 0 ? (
            <p className={muted}>None listed.</p>
          ) : (
            <>
              <div className="sm:hidden print:hidden space-y-2">
                {doc.concessions.map((c, i) => (
                  <div key={i} className={card}>
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{c.label}</p>
                      {c.required && <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Required</p>}
                    </div>
                    {c.value && <p className="text-sm text-gray-700 dark:text-gray-300">{c.value}</p>}
                  </div>
                ))}
              </div>
              <div className={desktop}>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={reportTh}>Concession</th>
                      <th className={reportTh}>Requested</th>
                      <th className={reportTh}>Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.concessions.map((c, i) => (
                      <tr key={i}>
                        <td className={reportTd}>{c.label}</td>
                        <td className={reportTd}>{c.value}</td>
                        <td className={reportTd}>{c.required ? "Required" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      )}

      {doc.history && (
        <Section title="Event history">
          {doc.history.length === 0 ? (
            <p className={muted}>No past events with room pickup.</p>
          ) : (
            <>
              <div className="sm:hidden print:hidden space-y-2">
                {doc.history.map((h, i) => (
                  <div key={i} className={card}>
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{h.name}</p>
                      <p className="text-sm text-gray-900 dark:text-white tabular-nums">peak {h.peak}</p>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{h.dates}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[
                        h.attendance != null ? `${h.attendance} attended` : null,
                        `${h.roomNights} of ${h.blockedNights} room nights`,
                        h.pickupPercent != null ? `${h.pickupPercent}%` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
              <div className={desktop}>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={reportTh}>Event</th>
                      <th className={reportTh}>Dates</th>
                      <th className={`${reportTh} text-right`}>Attendance</th>
                      <th className={`${reportTh} text-right`}>Peak night</th>
                      <th className={`${reportTh} text-right`}>Room nights</th>
                      <th className={`${reportTh} text-right`}>Blocked</th>
                      <th className={`${reportTh} text-right`}>Pickup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.history.map((h, i) => (
                      <tr key={i}>
                        <td className={reportTd}>{h.name}</td>
                        <td className={`${reportTd} whitespace-nowrap`}>{h.dates}</td>
                        <td className={num}>{round(h.attendance)}</td>
                        <td className={num}>{h.peak}</td>
                        <td className={num}>{h.roomNights}</td>
                        <td className={num}>{h.blockedNights}</td>
                        <td className={num}>{h.pickupPercent != null ? `${h.pickupPercent}%` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      )}

      {doc.requirements && (
        <Section title="Additional requirements">
          <Rich html={doc.requirements} />
        </Section>
      )}
    </div>
  );
}
