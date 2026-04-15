import type { getAVOrder } from "./actions";
import type { getWorkflowInstances } from "../workflows/actions";
import type { getAVOrderVendors } from "@/app/vendors/actions";
import { Section, Field } from "@/components/print/PrintDetails";
import { WorkflowSection } from "@/components/print/WorkflowSection";

type AVOrderData = NonNullable<Awaited<ReturnType<typeof getAVOrder>>>;
type WorkflowInstance = Awaited<ReturnType<typeof getWorkflowInstances>>[number];
type VendorAssignment = Awaited<ReturnType<typeof getAVOrderVendors>>[number];

function partyLabel(
  vendor: { name: string } | null | undefined,
  contact: { firstName: string; lastName: string } | null | undefined
): string {
  if (vendor) return vendor.name;
  if (contact) return `${contact.firstName} ${contact.lastName}`;
  return "—";
}

interface AVOrderDetailsProps {
  order: AVOrderData;
  vendors: VendorAssignment[];
  workflowInstances: WorkflowInstance[];
}

export function AVOrderDetails({
  order,
  vendors,
  workflowInstances,
}: AVOrderDetailsProps) {
  return (
    <div className="space-y-2">
      {/* Overview */}
      <Section title="Overview">
        {order.functions.length > 0 && (
          <Field
            label="Linked Functions"
            value={order.functions.map((f) => f.name).join(", ")}
          />
        )}
        {order.presentation && (
          <Field label="Linked Presentation" value={order.presentation.title} />
        )}
        <Field label="Notes" value={order.notes} />
      </Section>

      {/* General Equipment */}
      {order.equipmentItems.length > 0 && (
        <Section title="Equipment">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Item</th>
                <th className="pb-1 pr-4 font-medium">Qty</th>
                <th className="pb-1 font-medium">Responsible Party</th>
              </tr>
            </thead>
            <tbody>
              {order.equipmentItems.map((e) => (
                <tr key={e.id} className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{e.item}</td>
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{e.quantity}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700">
                    {e.responsiblePartyVendor?.name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Audio */}
      {order.audioSection && (
        <Section title="Audio">
          <Field label="Notes" value={order.audioSection.notes} />

          {order.audioSection.inputGroups.map((group) => (
            <div key={group.id} className="mb-4 ml-0">
              <p className="text-sm font-semibold text-gray-700 print:text-black mb-1">
                Input Group: {group.name}
              </p>
              <div className="text-xs text-gray-500 print:text-gray-600 mb-1">
                Provider: {partyLabel(group.providerVendor, group.providerContact)}
                {" · "}
                Operator: {partyLabel(group.operatorVendor, group.operatorContact)}
              </div>

              {group.inputItems.length > 0 && (
                <table className="w-full text-sm border-collapse ml-2 mb-2">
                  <thead>
                    <tr className="text-left text-gray-500 print:text-gray-600">
                      <th className="pb-1 pr-4 font-medium text-xs">Input</th>
                      <th className="pb-1 pr-4 font-medium text-xs">Qty</th>
                      <th className="pb-1 pr-4 font-medium text-xs">Equipment</th>
                      <th className="pb-1 font-medium text-xs">Provider / Operator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.inputItems.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100 print:border-gray-300">
                        <td className="py-1 pr-4 text-gray-900 print:text-black text-xs">{item.description}</td>
                        <td className="py-1 pr-4 text-gray-600 print:text-gray-700 text-xs">{item.quantity ?? "—"}</td>
                        <td className="py-1 pr-4 text-gray-600 print:text-gray-700 text-xs">
                          {item.equipment?.name ?? "—"}
                        </td>
                        <td className="py-1 text-gray-600 print:text-gray-700 text-xs">
                          {partyLabel(item.providerVendor, item.providerContact)}
                          {" / "}
                          {partyLabel(item.operatorVendor, item.operatorContact)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          {order.audioSection.monitorMixes.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-semibold text-gray-700 print:text-black mb-1">Monitor Mixes</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 print:text-gray-600">
                    <th className="pb-1 pr-4 font-medium text-xs">Description</th>
                    <th className="pb-1 pr-4 font-medium text-xs">Equipment</th>
                    <th className="pb-1 font-medium text-xs">Provider / Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {order.audioSection.monitorMixes.map((mix) => (
                    <tr key={mix.id} className="border-t border-gray-100 print:border-gray-300">
                      <td className="py-1 pr-4 text-gray-900 print:text-black text-xs">{mix.description}</td>
                      <td className="py-1 pr-4 text-gray-600 print:text-gray-700 text-xs">
                        {mix.equipment?.name ?? "—"}
                      </td>
                      <td className="py-1 text-gray-600 print:text-gray-700 text-xs">
                        {partyLabel(mix.providerVendor, mix.providerContact)}
                        {" / "}
                        {partyLabel(mix.operatorVendor, mix.operatorContact)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* Video */}
      {order.videoSection && (
        <Section title="Video">
          <Field label="Notes" value={order.videoSection.notes} />
          {order.videoSection.equipmentItems.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 print:text-gray-600">
                  <th className="pb-1 pr-4 font-medium">Item</th>
                  <th className="pb-1 pr-4 font-medium">Qty</th>
                  <th className="pb-1 font-medium">Provider / Operator</th>
                </tr>
              </thead>
              <tbody>
                {order.videoSection.equipmentItems.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 print:border-gray-300">
                    <td className="py-1.5 pr-4 text-gray-900 print:text-black">{e.item}</td>
                    <td className="py-1.5 pr-4 text-gray-900 print:text-black">{e.quantity}</td>
                    <td className="py-1.5 text-gray-600 print:text-gray-700">
                      {partyLabel(e.providerVendor, e.providerContact)}
                      {" / "}
                      {partyLabel(e.operatorVendor, e.operatorContact)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
