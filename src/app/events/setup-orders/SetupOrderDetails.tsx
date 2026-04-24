import type { getSetupOrder } from "./actions";
import type { getWorkflowInstances } from "../workflows/actions";
import type { getSetupOrderVendors } from "@/app/vendors/actions";
import { aggregateSetupTables } from "./utils";
import { Section, Field } from "@/components/print/PrintDetails";
import { WorkflowSection } from "@/components/print/WorkflowSection";

type SetupOrderData = NonNullable<Awaited<ReturnType<typeof getSetupOrder>>>;
type WorkflowInstance = Awaited<ReturnType<typeof getWorkflowInstances>>[number];
type VendorAssignment = Awaited<ReturnType<typeof getSetupOrderVendors>>[number];

interface SetupOrderDetailsProps {
  setupOrder: SetupOrderData;
  vendors: VendorAssignment[];
  workflowInstances: WorkflowInstance[];
}

export function SetupOrderDetails({
  setupOrder,
  vendors,
  workflowInstances,
}: SetupOrderDetailsProps) {
  const setupTypeLabel = setupOrder.setupType ?? null;
  const { tableTotals, chairTotals } = aggregateSetupTables(setupOrder.tables);

  return (
    <div className="space-y-2">
      {/* Overview */}
      <Section title="Overview">
        <Field label="Setup Type" value={setupTypeLabel} />
        <Field label="Room" value={setupOrder.room?.name} />
        <Field
          label="Linked Functions"
          value={setupOrder.functions.length > 0 ? setupOrder.functions.map((f) => f.name).join(", ") : null}
        />
        <Field label="Notes" value={setupOrder.notes} />
      </Section>

      {/* Tables */}
      {setupOrder.tables.length > 0 && (
        <Section title="Table Setup">
          <table className="w-full text-sm border-collapse mb-3">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Table Type</th>
                <th className="pb-1 pr-4 font-medium">Qty</th>
                <th className="pb-1 pr-4 font-medium">Chair Type</th>
                <th className="pb-1 pr-4 font-medium">Chairs/Table</th>
                <th className="pb-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {setupOrder.tables.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{t.tableType ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{t.quantity}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{t.chairType ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{t.chairCount ?? "—"}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700">{t.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(Object.keys(tableTotals).length > 0 || Object.keys(chairTotals).length > 0) && (
            <div className="text-sm text-gray-600 print:text-gray-700 space-y-0.5">
              {Object.entries(tableTotals).map(([type, qty]) => (
                <p key={type}>Total {type}: {qty}</p>
              ))}
              {Object.entries(chairTotals).map(([type, qty]) => (
                <p key={type}>Total {type} chairs: {qty}</p>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Equipment */}
      {setupOrder.equipmentItems.length > 0 && (
        <Section title="Equipment">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Item</th>
                <th className="pb-1 pr-4 font-medium">Qty</th>
                <th className="pb-1 font-medium">Provider</th>
              </tr>
            </thead>
            <tbody>
              {setupOrder.equipmentItems.map((e) => (
                <tr key={e.id} className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{e.item}</td>
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{e.quantity}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700">
                    {e.providerVendor?.name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Vendors */}
      {vendors.length > 0 && (
        <Section title="Vendors">
          {vendors.map((v) => (
            <div key={v.id} className="text-sm mb-1">
              <span className="text-gray-900 print:text-black font-medium">{v.vendor.name}</span>
              {v.notes && (
                <span className="text-gray-500 print:text-gray-600 ml-2">— {v.notes}</span>
              )}
            </div>
          ))}
        </Section>
      )}

      <WorkflowSection workflowInstances={workflowInstances} />
    </div>
  );
}
