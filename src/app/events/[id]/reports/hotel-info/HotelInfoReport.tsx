import type { HotelInfoData } from "@/app/events/reports/actions";
import { ReportNav } from "@/components/ReportNav";
import { reportSectionCard, reportTd, reportTh } from "@/lib/reportStyles";
import { CHARGE_SCOPE_LABELS, formatDateKey, formatMoney } from "@/lib/hotels";

const rateText = (r: { min: number; max: number }) =>
  r.min === r.max ? formatMoney(r.min) : `${formatMoney(r.min)} – ${formatMoney(r.max)}`;

// Guest-facing hotel list: one card per block, HQ first.
export function HotelInfoReport({ data }: { data: HotelInfoData }) {
  if (data.hotels.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No hotel blocks.</p>;
  }
  return (
    <div className="space-y-6">
      <ReportNav sections={data.hotels.map((h) => ({ id: `hotel-${h.id}`, label: h.name }))} />
      {data.hotels.map((h) => (
        <section key={h.id} id={`hotel-${h.id}`} className={`${reportSectionCard} print:break-inside-avoid scroll-mt-24`}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black">
            {h.name}
            {h.isHq && <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">Headquarters hotel</span>}
          </h2>
          {h.address && <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-700">{h.address}</p>}
          {(h.distanceMiles != null || h.driveMinutes != null) && (
            <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-700">
              {[h.distanceMiles != null ? `${h.distanceMiles} mi from venue` : null, h.driveMinutes != null ? `${h.driveMinutes} min drive` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {(
              [
                ["Dates", h.checkIn && h.checkOut ? `${formatDateKey(h.checkIn)} – ${formatDateKey(h.checkOut)}` : null],
                ["Book by", h.cutoffDate ? formatDateKey(h.cutoffDate) : null],
                ["Group code", h.groupCode],
                ["Phone", h.bookingPhone],
                ["Reservations", h.reservationMethod],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-gray-500 dark:text-gray-400 print:text-gray-600">{label}</dt>
                  <dd className="text-gray-900 dark:text-white print:text-black">{value}</dd>
                </div>
              ))}
          </dl>
          {h.bookingLink && (
            <p className="mt-3 text-sm">
              <a href={h.bookingLink} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all print:text-black">
                {h.bookingLink}
              </a>
            </p>
          )}

          {h.rates.length > 0 && (
            <table className="mt-4 w-full">
              <thead>
                <tr>
                  <th className={reportTh}>Room</th>
                  <th className={`${reportTh} text-right`}>Rate / night</th>
                </tr>
              </thead>
              <tbody>
                {h.rates.map((r) => (
                  <tr key={r.roomType}>
                    <td className={reportTd}>{r.roomType}</td>
                    <td className={`${reportTd} text-right`}>{rateText(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {h.charges.length > 0 && (
            <ul className="mt-3 text-sm text-gray-700 dark:text-gray-300 print:text-gray-900">
              {h.charges.map((c, i) => (
                <li key={i}>
                  {c.chargeType}: {formatMoney(c.amount)}
                  {c.scope ? ` ${CHARGE_SCOPE_LABELS[c.scope].toLowerCase()}` : ""}
                </li>
              ))}
            </ul>
          )}
          {h.amenities.length > 0 && (
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 print:text-gray-900">{h.amenities.join(" · ")}</p>
          )}
        </section>
      ))}
    </div>
  );
}
