import React from "react";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getEquipmentResponsibilityData } from "@/app/events/reports/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { MODEL_LABELS } from "@/app/vendors/model-types";

export const dynamic = "force-dynamic";

export default async function EquipmentResponsibilityPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendors?: string; models?: string }>;
}) {
  const { id: eventId } = await params;
  const { vendors: vendorParam, models: modelsParam } = await searchParams;

  const filters = {
    vendorIds: vendorParam ? vendorParam.split(",").filter(Boolean) : undefined,
    modelTypes: modelsParam ? modelsParam.split(",").filter(Boolean) : undefined,
  };

  const qs = new URLSearchParams({
    ...(vendorParam ? { vendors: vendorParam } : {}),
    ...(modelsParam ? { models: modelsParam } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/equipment-responsibility${qs ? `?${qs}` : ""}`;

  const [event, groups] = await Promise.all([
    getEvent(eventId),
    getEquipmentResponsibilityData(eventId, filters),
  ]);

  if (!event) notFound();

  const totalItems = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const generated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const th =
    "px-3 py-2 text-left text-xs font-semibold text-gray-900 print:text-black border-b border-gray-300 print:border-gray-400 bg-gray-100 print:bg-gray-200 whitespace-nowrap";
  const td =
    "px-3 py-2 text-xs text-gray-700 print:text-gray-900 border-b border-gray-200 print:border-gray-300 align-top";

  const hasUnscheduled = groups.some((g) =>
    g.rows.some((r) => r.sources.some((s) => !s.isScheduled))
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PrintHeader eventName={event.name} title="Equipment Responsibility" backHref={backHref} />

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">No equipment items found for the selected filters.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={th}>Category</th>
              <th className={th}>Item</th>
              <th className={`${th} text-right`}>Qty</th>
              <th className={`${th} text-right`}>Peak Needed</th>
              <th className={th}>Sources</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.vendorId ?? "__unassigned__"}>
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-2 text-xs font-semibold text-gray-900 print:text-black bg-gray-50 print:bg-gray-100 border-b border-gray-300 print:border-gray-400"
                  >
                    {group.vendorName}
                  </td>
                </tr>
                {group.rows.map((row, i) => (
                  <tr key={`${row.equipmentId ?? row.itemName}-${i}`}>
                    <td className={td}>{row.category ?? ""}</td>
                    <td className={td}>{row.itemName}</td>
                    <td className={`${td} text-right`}>{row.totalQuantity}</td>
                    <td className={`${td} text-right`}>
                      {row.sources.length === 1
                        ? "—"
                        : row.peakIsExact
                          ? String(row.peakNeeded)
                          : `≥${row.peakNeeded}`}
                    </td>
                    <td className={td}>
                      {row.sources
                        .map(
                          (s) =>
                            `${MODEL_LABELS[s.modelType] ?? s.modelType}: ${s.orderName} (${s.quantity})${!s.isScheduled ? " †" : ""}`
                        )
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200 print:border-gray-400 text-xs text-gray-500 print:text-gray-600 flex justify-between">
        <span>
          {totalItems} item{totalItems !== 1 ? "s" : ""}
        </span>
        <span>Generated {generated}</span>
      </div>

      {hasUnscheduled && (
        <p className="mt-2 text-xs text-gray-500 print:text-gray-600">
          † Unscheduled — peak is a floor estimate
        </p>
      )}
    </div>
  );
}
