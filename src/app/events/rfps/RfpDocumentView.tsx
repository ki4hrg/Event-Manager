import type { ReactNode } from "react";
import { formatNight } from "@/lib/hotels";
import { labelMicroCaps, reportSectionCard, reportTd, reportTh } from "@/lib/reportStyles";
import type { RfpBlockDoc, RfpDocument, RfpFact, RfpSpaceDay } from "@/lib/rfp/document";

// The RFP document on screen and on the /print route, in APEX Single
// Facility RFP order. Same RfpDocument the .docx renders; data tables have a
// mobile card layout.

const richClass =
  "text-sm text-gray-900 dark:text-white print:text-black [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1";
const num = `${reportTd} text-right tabular-nums`;
const muted = "text-sm text-gray-500 dark:text-gray-400 print:text-gray-600";
const subhead = "text-sm font-semibold text-gray-900 dark:text-white print:text-black mt-4 mb-2 first:mt-0";
const card = "border border-gray-200 dark:border-gray-700 rounded-lg p-3";
const mobile = "sm:hidden print:hidden space-y-2";
const desktop = "hidden sm:block print:block overflow-x-auto print:overflow-visible";
const blank = `${reportTd} min-w-[6rem]`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={reportSectionCard}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="print:break-inside-avoid">
      <h3 className={subhead}>{title}</h3>
      {children}
    </div>
  );
}

function Rich({ html }: { html: string }) {
  // HTML from RichTextEditor (Rfp.introduction / Rfp.requirements, ESG narrative).
  return <div className={richClass} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Facts({ items }: { items: RfpFact[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {items.map((f) => (
        <div key={f.label}>
          <dt className={labelMicroCaps}>{f.label}</dt>
          <dd className="text-gray-900 dark:text-white print:text-black whitespace-pre-line">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BlockTable({ b }: { b: RfpBlockDoc }) {
  const multi = b.roomTypes.length > 1;
  return (
    <>
      <div className="sm:hidden print:hidden divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
        {b.nights.map((k) => (
          <div key={k} className="flex justify-between gap-3 px-3 py-2 text-sm">
            <span className="font-medium text-gray-900 dark:text-white">{formatNight(k)}</span>
            <span className="text-right text-gray-700 dark:text-gray-300">
              {multi && <span className="block text-xs text-gray-500 dark:text-gray-400">{b.roomTypes.map((t) => `${t} ${b.cells[k]?.[t] ?? 0}`).join(" · ")}</span>}
              {b.totals[k]} rooms
            </span>
          </div>
        ))}
      </div>
      <div className={desktop}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={reportTh}>Night</th>
              {b.roomTypes.map((t) => (
                <th key={t} className={`${reportTh} text-right`}>
                  {t}
                </th>
              ))}
              {multi && <th className={`${reportTh} text-right`}>Total</th>}
            </tr>
          </thead>
          <tbody>
            {b.nights.map((k) => (
              <tr key={k}>
                <td className={`${reportTd} whitespace-nowrap`}>{formatNight(k)}</td>
                {b.roomTypes.map((t) => (
                  <td key={t} className={num}>
                    {b.cells[k]?.[t] ?? 0}
                  </td>
                ))}
                {multi && <td className={`${num} font-semibold`}>{b.totals[k]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${muted} mt-2`}>
        Rooms on peak night {b.peak} · {b.roomNights} room nights
      </p>
    </>
  );
}

function SpaceTable({ days, fb }: { days: RfpSpaceDay[]; fb: boolean }) {
  const anyRoom = days.some((d) => d.rows.some((r) => r.room));
  const anyAv = days.some((d) => d.rows.some((r) => r.av));
  return (
    <>
      <div className={mobile}>
        {days.map((d) => (
          <div key={d.day} className="space-y-2">
            <p className={labelMicroCaps}>{d.label}</p>
            {d.rows.map((r, i) => (
              <div key={i} className={card}>
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{r.name}</p>
                  {r.attendance != null && <p className="text-sm text-gray-900 dark:text-white tabular-nums">{r.attendance}</p>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{[r.time, r.type, fb ? null : r.setup].filter(Boolean).join(" · ")}</p>
                {(r.room || r.av || r.hold24 || r.areaSqFt) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {[r.room, r.areaSqFt ? `${r.areaSqFt} sq ft` : null, r.hold24 ? "24-hr hold" : null, r.av].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={desktop}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={reportTh}>Time</th>
              <th className={reportTh}>{fb ? "Meal" : "Function"}</th>
              <th className={reportTh}>Type</th>
              {!fb && <th className={reportTh}>Set-up</th>}
              <th className={`${reportTh} text-right`}>Attendees</th>
              {!fb && <th className={`${reportTh} text-right`}>Sq ft</th>}
              {!fb && <th className={reportTh}>24-hr hold</th>}
              {anyAv && <th className={reportTh}>A/V</th>}
              {anyRoom && <th className={reportTh}>Room</th>}
            </tr>
          </thead>
          {days.map((d) => (
            <tbody key={d.day}>
              <tr>
                <td colSpan={9} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 print:text-gray-700">
                  {d.label}
                </td>
              </tr>
              {d.rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${reportTd} whitespace-nowrap`}>{r.time}</td>
                  <td className={reportTd}>{r.name}</td>
                  <td className={reportTd}>{r.type}</td>
                  {!fb && <td className={reportTd}>{r.setup}</td>}
                  <td className={num}>{r.attendance ?? ""}</td>
                  {!fb && <td className={num}>{r.areaSqFt ?? ""}</td>}
                  {!fb && <td className={reportTd}>{r.hold24 ? "Yes" : ""}</td>}
                  {anyAv && <td className={reportTd}>{r.av}</td>}
                  {anyRoom && <td className={reportTd}>{r.room}</td>}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

// A fill-in table for the hotel's response: labelled rows, empty cells.
function BlankTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="min-w-full">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className={reportTh}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <td key={c} className={j < r.length ? reportTd : blank}>
                  {r[j] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RfpDocumentView({ doc }: { doc: RfpDocument }) {
  const { meta } = doc;
  const contactLines = doc.contact ? [doc.contact.name, doc.contact.title, doc.contact.organization, doc.contact.email, doc.contact.phone].filter(Boolean).join("\n") : null;
  const hostLines = doc.host ? [doc.host.name, doc.host.address, doc.host.phone, doc.host.website].filter(Boolean).join("\n") : null;
  const profileText: [string, string | null][] = [
    ["Host overview", doc.profile.overview],
    ["Event objectives", doc.profile.objectives],
    ["Attendee profile", doc.profile.demographics],
    ["Accessibility / special needs", doc.profile.accessibility],
  ];
  const dateFacts: RfpFact[] = [
    ...(doc.dates.preferred ? [{ label: "Preferred dates", value: doc.dates.preferred }] : []),
    ...doc.dates.alternates.map((a, i) => ({ label: `Alternate dates ${i + 1}`, value: a })),
    { label: "Dates flexible", value: doc.dates.flexible ? "Yes" : "No" },
  ];

  return (
    <div className="space-y-6 print:space-y-4">
      <section className={reportSectionCard}>
        <Facts
          items={[
            { label: "Event", value: `${meta.eventName}\n${meta.eventDates}` },
            ...(doc.contact ? [{ label: "Respond to", value: doc.contact.name }] : []),
            ...(meta.responseDue ? [{ label: "Proposal due", value: meta.responseDue }] : []),
          ]}
        />
      </section>

      <Section title="I. Contact information">
        <Facts
          items={[
            { label: "Key contact", value: contactLines ?? "—" },
            ...(hostLines ? [{ label: "Host organization", value: hostLines }] : []),
          ]}
        />
      </Section>

      <Section title="II. Event profile">
        <Facts items={doc.profile.facts} />
        {profileText.map(([label, html]) =>
          html ? (
            <Sub key={label} title={label}>
              <Rich html={html} />
            </Sub>
          ) : null,
        )}
        {doc.history && (
          <Sub title="Event history">
            {doc.history.length === 0 ? (
              <p className={muted}>No past events with room pickup.</p>
            ) : (
              <>
                <div className={mobile}>
                  {doc.history.map((h, i) => (
                    <div key={i} className={card}>
                      <div className="flex justify-between gap-3">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{h.name}</p>
                        <p className="text-sm text-gray-900 dark:text-white tabular-nums">{h.roomNights} room nights</p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{[`${h.start} – ${h.end}`, h.city].filter(Boolean).join(" · ")}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {[h.facility, h.attendance != null ? `${h.attendance} attended` : null, `peak ${h.peak}`, h.pickupPercent != null ? `${h.pickupPercent}% pickup` : null]
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
                        <th className={reportTh}>Facility</th>
                        <th className={reportTh}>City</th>
                        <th className={reportTh}>Start</th>
                        <th className={reportTh}>End</th>
                        <th className={`${reportTh} text-right`}>Attendance</th>
                        <th className={`${reportTh} text-right`}>Room nights</th>
                        <th className={`${reportTh} text-right`}>Peak night</th>
                        <th className={`${reportTh} text-right`}>Pickup</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.history.map((h, i) => (
                        <tr key={i}>
                          <td className={reportTd}>{h.name}</td>
                          <td className={reportTd}>{h.facility}</td>
                          <td className={reportTd}>{h.city}</td>
                          <td className={`${reportTd} whitespace-nowrap`}>{h.start}</td>
                          <td className={`${reportTd} whitespace-nowrap`}>{h.end}</td>
                          <td className={num}>{h.attendance ?? ""}</td>
                          <td className={num}>{h.roomNights}</td>
                          <td className={num}>{h.peak}</td>
                          <td className={num}>{h.pickupPercent != null ? `${h.pickupPercent}%` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Sub>
        )}
      </Section>

      <Section title="III. Requirements">
        {doc.statementOfNeed && (
          <Sub title="Statement of need">
            <Rich html={doc.statementOfNeed} />
          </Sub>
        )}
        {doc.locations.length > 0 && (
          <Sub title="Location">
            <p className="text-sm text-gray-900 dark:text-white print:text-black">Preferred areas: {doc.locations.join(" · ")}</p>
          </Sub>
        )}
        <Sub title="Dates">
          <Facts items={dateFacts} />
          {doc.dates.notes && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{doc.dates.notes}</p>}
        </Sub>
        {doc.facility.length > 0 && (
          <Sub title="Facility requirements">
            <Facts items={doc.facility} />
          </Sub>
        )}
        {doc.blocks && (
          <Sub title="Guest room block">
            {doc.blocks.length === 0 && <p className={muted}>No room blocks requested.</p>}
            <div className="space-y-6">
              {doc.blocks.map((b, i) => (
                <div key={i} className="print:break-inside-avoid">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white print:text-black mb-2">{b.label}</p>
                  {b.nights.length > 0 && <BlockTable b={b} />}
                  {b.targetRate && <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">Room rate must be no more than {b.targetRate}</p>}
                  {b.notes && <p className="mt-1 text-sm italic text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{b.notes}</p>}
                </div>
              ))}
            </div>
            {doc.roomTerms.length > 0 && (
              <div className="mt-4">
                <Facts items={doc.roomTerms} />
              </div>
            )}
          </Sub>
        )}
        {doc.amenities.length > 0 && (
          <Sub title="Requested amenities">
            <p className="text-sm text-gray-900 dark:text-white print:text-black">{doc.amenities.join(" · ")}</p>
          </Sub>
        )}
        {doc.meetingSpace && (
          <Sub title="Function space">
            {doc.meetingSpace.length === 0 ? <p className={muted}>No function space requested.</p> : <SpaceTable days={doc.meetingSpace} fb={false} />}
          </Sub>
        )}
        {doc.fb && (
          <Sub title="Food & beverage">
            {doc.fb.days.length > 0 && <SpaceTable days={doc.fb.days} fb />}
            {doc.fb.days.length === 0 && doc.fb.terms.length === 0 && <p className={muted}>No food & beverage requested.</p>}
            {doc.fb.terms.length > 0 && (
              <div className="mt-3">
                <Facts items={doc.fb.terms} />
              </div>
            )}
          </Sub>
        )}
        {doc.concessions && (
          <Sub title="Concessions desired">
            {doc.concessions.length === 0 ? (
              <p className={muted}>None listed.</p>
            ) : (
              <div className="space-y-3">
                {doc.concessions.map((g) => (
                  <div key={g.group}>
                    <p className={`${labelMicroCaps} mb-1`}>{g.group}</p>
                    <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-700">
                      {g.items.map((c, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-x-3 py-1.5 text-gray-900 dark:text-white print:text-black">
                          <span>
                            {c.label}
                            {c.required && <span className="text-gray-500 dark:text-gray-400 print:text-gray-600"> · required</span>}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300">{c.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Sub>
        )}
        {doc.requirements && (
          <Sub title="Other requirements">
            <Rich html={doc.requirements} />
          </Sub>
        )}
      </Section>

      <Section title="IV. Proposal specifications">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">Direct questions to the key contact in section I.</p>
        <Facts items={doc.specs.filter((s) => s.label !== "Questions to")} />
        {doc.attachments.length > 0 && (
          <Sub title="Attachments">
            <ul className="list-disc pl-5 text-sm text-gray-900 dark:text-white print:text-black">
              {doc.attachments.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Sub>
        )}
      </Section>

      {doc.responseForm && (
        <Section title="V. Proposal content">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Please include the following in your proposal.</p>
          {doc.responseForm.roomTypes.length > 0 && (
            <Sub title="Dates & guest rooms">
              <BlankTable columns={["Room type", "Rate", "Rooms available", "Notes"]} rows={doc.responseForm.roomTypes.map((t) => [t])} />
            </Sub>
          )}
          {doc.responseForm.meetingSpace.length > 0 && (
            <Sub title="Function space">
              <BlankTable
                columns={["Day", "Time", "Function", "Set-up", "Room", "Capacity for set-up", "24-hr hold available"]}
                rows={doc.responseForm.meetingSpace.map((r) => [r.day, r.time, r.name, r.setup ?? ""])}
              />
            </Sub>
          )}
          <Sub title="Food & beverage">
            <BlankTable columns={["F&B function", "Average per-person price"]} rows={[...doc.responseForm.mealTypes.map((m) => [m]), ["Standard tax %"], ["Standard service charge %"]]} />
          </Sub>
          {doc.responseForm.concessions.length > 0 && (
            <Sub title="Concessions offered">
              <BlankTable columns={["Concession", "Offered"]} rows={doc.responseForm.concessions.map((c) => [c])} />
            </Sub>
          )}
        </Section>
      )}
    </div>
  );
}
