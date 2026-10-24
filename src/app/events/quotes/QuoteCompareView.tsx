import Link from "next/link";
import type { PermissionResource } from "@prisma/client";
import { formatMoney } from "@/lib/hotels";
import { reportSectionCard, reportTd, reportTh } from "@/lib/reportStyles";
import type { QuoteComparison } from "@/lib/rfp/compareQuotes";
import { LineAwardToggle } from "./LineAwardToggle";

// Quotes side by side against the RFP's line items: desktop/print is a table
// with one column per vendor; mobile is one card per vendor. Each line shows
// the quote that won it; with `award` (the interactive view) every cell has a
// checkbox to award the line to that quote.

const muted = "text-gray-500 dark:text-gray-400 print:text-gray-600";
const short = "text-red-600 dark:text-red-400 print:text-red-700";
const won = "bg-green-50 dark:bg-green-900/20 print:bg-transparent";
const desktop = "hidden sm:block print:block overflow-x-auto print:overflow-visible";

type Award = { action: (lineItemIds: string[], quoteId: string | null) => Promise<void>; resource: PermissionResource };

export function QuoteCompareView({ data, eventId, award }: { data: QuoteComparison; eventId: string | null; award?: Award }) {
  const vendor = (q: QuoteComparison["quotes"][number]) =>
    eventId ? (
      <Link href={`/events/${eventId}/quotes/${q.id}`} className="text-blue-600 dark:text-blue-400 hover:underline print:text-black">
        {q.vendor}
      </Link>
    ) : (
      q.vendor
    );
  if (data.quotes.length === 0) {
    return (
      <section className={reportSectionCard}>
        <p className={`text-sm ${muted}`}>No quotes yet.</p>
      </section>
    );
  }
  const groupHeading = (i: number) => data.lines[i].group && (i === 0 || data.lines[i - 1].group !== data.lines[i].group);
  const status = (q: QuoteComparison["quotes"][number]) => `${q.status}${q.linesWon ? ` · won ${q.linesWon}` : ""}`;
  // Open lines are tagged once any line is awarded.
  const openTag = (l: QuoteComparison["lines"][number]) =>
    data.awarded > 0 && !l.awardedQuoteId && <span className={`ml-1 text-xs ${muted}`}>(open)</span>;
  const mark = (l: QuoteComparison["lines"][number], qi: number) => {
    const c = l.cells[qi];
    if (award && l.lineItemId) {
      return (
        <LineAwardToggle
          checked={c.awarded}
          lineItemId={l.lineItemId}
          quoteId={data.quotes[qi].id}
          label={`Award ${l.label} to ${data.quotes[qi].vendor}`}
          action={award.action}
          resource={award.resource}
        />
      );
    }
    return c.awarded ? <span className="mr-1 text-green-700 dark:text-green-400 print:text-black">✓</span> : null;
  };
  return (
    <section className={reportSectionCard}>
      {data.lines.length > 0 && (
        <p className={`mb-3 text-sm ${muted}`}>
          {data.awarded} of {data.lines.length} line{data.lines.length === 1 ? "" : "s"} awarded
        </p>
      )}
      <div className="sm:hidden print:hidden space-y-3">
        {data.quotes.map((q, qi) => (
          <div key={q.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1">
            <div className="flex justify-between gap-3">
              <p className="font-semibold text-sm text-gray-900 dark:text-white">{vendor(q)}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                {formatMoney(String(q.total))}
                {data.lowest === q.id && <span className="ml-1 text-xs font-normal text-green-700 dark:text-green-400">lowest</span>}
              </p>
            </div>
            <p className={`text-xs ${muted}`}>{status(q)}</p>
            {data.lines.map((l, i) => (
              <div key={i} className={`flex justify-between gap-3 text-xs ${l.cells[qi].awarded ? won : ""}`}>
                <span className="text-gray-700 dark:text-gray-300">
                  {mark(l, qi)}
                  {l.label}
                  {openTag(l)}
                </span>
                <span className={l.cells[qi].missing ? short : "text-gray-900 dark:text-white tabular-nums"}>{l.cells[qi].text}</span>
              </div>
            ))}
            {data.extras[qi].map((e, i) => (
              <p key={i} className={`text-xs italic ${muted}`}>
                + {e}
              </p>
            ))}
            {data.footer
              .filter((f) => f.label !== "Total")
              .map((f) => (
                <div key={f.label} className="flex justify-between gap-3 text-xs">
                  <span className={muted}>{f.label}</span>
                  <span className="text-gray-900 dark:text-white tabular-nums">{f.cells[qi].text}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className={desktop}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={reportTh}></th>
              <th className={`${reportTh} text-right`}>Requested</th>
              {data.quotes.map((q) => (
                <th key={q.id} className={`${reportTh} text-right`}>
                  {vendor(q)}
                  <span className={`block font-normal ${muted}`}>{status(q)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td className={reportTd}>
                  {groupHeading(i) && <span className={`block text-xs font-semibold uppercase tracking-wide ${muted}`}>{l.group}</span>}
                  {l.label}
                  {openTag(l)}
                </td>
                <td className={`${reportTd} text-right whitespace-nowrap`}>{l.requested}</td>
                {l.cells.map((c, j) => (
                  <td key={j} className={`${reportTd} text-right whitespace-nowrap ${c.missing ? short : ""} ${c.awarded ? won : ""}`}>
                    {mark(l, j)}
                    {c.text}
                  </td>
                ))}
              </tr>
            ))}
            {data.extras.some((e) => e.length) && (
              <tr>
                <td className={reportTd}>Extras</td>
                <td className={reportTd}></td>
                {data.extras.map((e, j) => (
                  <td key={j} className={`${reportTd} text-right text-xs whitespace-pre-line`}>
                    {e.join("\n") || "—"}
                  </td>
                ))}
              </tr>
            )}
            {data.footer.map((f) => (
              <tr key={f.label}>
                <td className={`${reportTd} ${f.label === "Total" ? "font-semibold" : ""}`}>{f.label}</td>
                <td className={reportTd}></td>
                {f.cells.map((c, j) => (
                  <td key={j} className={`${reportTd} text-right whitespace-nowrap tabular-nums ${f.label === "Total" ? "font-semibold" : ""}`}>
                    {c.text}
                    {f.label === "Total" && data.lowest === data.quotes[j].id && <span className="ml-1 text-xs font-normal text-green-700 dark:text-green-400 print:text-green-800">lowest</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-2 text-xs ${muted}`}>Red: not quoted, or quoted for fewer than asked.{data.awarded > 0 && !award ? " ✓: awarded." : ""}</p>
    </section>
  );
}
