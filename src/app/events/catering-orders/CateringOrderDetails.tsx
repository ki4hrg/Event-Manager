import type { getCateringOrder } from "./actions";
import type { getWorkflowInstances } from "../workflows/actions";
import type { getCateringOrderVendors } from "@/app/vendors/actions";
import { Section, Field } from "@/components/print/PrintDetails";
import { WorkflowSection } from "@/components/print/WorkflowSection";
import { formatPhone } from "@/lib/format-phone";
import { computeServiceLocationCounts } from "@/lib/cateringServiceLocations";

type CateringOrderData = NonNullable<Awaited<ReturnType<typeof getCateringOrder>>>;
type WorkflowInstance = Awaited<ReturnType<typeof getWorkflowInstances>>[number];
type VendorAssignment = Awaited<ReturnType<typeof getCateringOrderVendors>>[number];

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface CateringOrderDetailsProps {
  order: CateringOrderData;
  vendors: VendorAssignment[];
  workflowInstances: WorkflowInstance[];
}

export function CateringOrderDetails({
  order,
  vendors,
  workflowInstances,
}: CateringOrderDetailsProps) {
  return (
    <div className="space-y-2">
      {/* Overview */}
      <Section title="Overview">
        <Field
          label="Linked Function"
          value={
            order.function
              ? `${order.function.name}${order.function.rooms[0]?.room.name ? ` (${order.function.rooms[0].room.name})` : ""}`
              : null
          }
        />
        <Field label="Service Style" value={order.serviceStyle} />
        {(order.expectedCount != null || order.confirmedCount != null || order.guaranteeCount != null) && (
          <div className="mb-2 text-sm">
            <span className="font-medium text-gray-500 print:text-gray-600">Attendance: </span>
            <span className="text-gray-900 print:text-black">
              {[
                order.expectedCount != null && `Expected: ${order.expectedCount}`,
                order.confirmedCount != null && `Confirmed: ${order.confirmedCount}`,
                order.guaranteeCount != null && `Guarantee: ${order.guaranteeCount}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        )}
        {(order.depositDeadline || order.guaranteeDeadline || order.paymentDeadline) && (
          <div className="mb-2 text-sm">
            <span className="font-medium text-gray-500 print:text-gray-600">Deadlines: </span>
            <span className="text-gray-900 print:text-black">
              {[
                order.depositDeadline && `Deposit: ${formatDate(order.depositDeadline)}`,
                order.guaranteeDeadline && `Guarantee: ${formatDate(order.guaranteeDeadline)}`,
                order.paymentDeadline && `Payment: ${formatDate(order.paymentDeadline)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        )}
        {(order.rentalMinimum != null || order.fbMinimum != null) && (
          <div className="mb-2 text-sm">
            <span className="font-medium text-gray-500 print:text-gray-600">Minimums: </span>
            <span className="text-gray-900 print:text-black">
              {[
                order.rentalMinimum != null && `Rental: $${order.rentalMinimum.toLocaleString()}`,
                order.fbMinimum != null && `F&B: $${order.fbMinimum.toLocaleString()}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        )}
        <Field label="Dietary Notes" value={order.dietaryNotes} />
        <Field label="Staffing Notes" value={order.staffingNotes} />
        <Field label="Cancellation Terms" value={order.cancellationTerms} />
        <Field label="Notes" value={order.notes} />
      </Section>

      {order.additionalServiceLocations.length > 0 && (() => {
        const primaryRoom = order.function?.rooms[0]?.room.name ?? null;
        const primaryFunctionName = order.function?.name ?? null;
        const { sumKnown, uncountedCount, primaryRemaining, exceedsExpected, exceedsConfirmed } =
          computeServiceLocationCounts(
            order.additionalServiceLocations,
            order.expectedCount,
            order.confirmedCount,
          );

        const primaryDisplay = primaryFunctionName ?? "Main Service";
        const primaryLocation = `${primaryDisplay}${primaryRoom ? ` (${primaryRoom})` : ""}`;
        const primaryCount =
          order.expectedCount != null && primaryRemaining != null
            ? `${primaryRemaining} of ${order.expectedCount}`
            : "—";

        return (
          <Section title="Service Locations">
            {uncountedCount > 0 && (
              <div className="text-xs text-gray-500 print:text-gray-600 mb-1">
                ({uncountedCount} location count{uncountedCount === 1 ? "" : "s"} not yet set)
              </div>
            )}
            {exceedsExpected && order.expectedCount != null && (
              <div className="text-xs text-amber-700 print:text-black mb-1">
                ⚠ Additional location counts ({sumKnown}) exceed order expected count ({order.expectedCount}).
              </div>
            )}
            {exceedsConfirmed && order.confirmedCount != null && (
              <div className="text-xs text-amber-700 print:text-black mb-2">
                ⚠ Additional location counts ({sumKnown}) also exceed confirmed count ({order.confirmedCount}).
              </div>
            )}
            <table className="w-full text-sm border-collapse mt-1">
              <thead>
                <tr className="text-left text-gray-500 print:text-gray-600">
                  <th className="pb-1 pr-4 font-medium">Location</th>
                  <th className="pb-1 pr-4 font-medium">Expected</th>
                  <th className="pb-1 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">
                    {primaryLocation}
                    <span className="ml-1 text-xs text-gray-500 print:text-gray-600">[Primary]</span>
                  </td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{primaryCount}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700"></td>
                </tr>
                {order.additionalServiceLocations.map((loc) => {
                  const derivedRoom = loc.function?.rooms[0]?.room.name ?? null;
                  const functionName = loc.function?.name ?? null;
                  const baseName = loc.name ?? functionName ?? "Unnamed location";
                  const roomAside = derivedRoom ? ` (${derivedRoom})` : "";
                  const functionAside = loc.name && functionName ? ` · ${functionName}${roomAside}` : (!loc.name ? roomAside : "");
                  return (
                    <tr key={loc.id} className="border-t border-gray-100 print:border-gray-300">
                      <td className="py-1.5 pr-4 text-gray-900 print:text-black">
                        {baseName}
                        <span className="text-gray-500 print:text-gray-600">{functionAside}</span>
                      </td>
                      <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{loc.expectedCount ?? "—"}</td>
                      <td className="py-1.5 text-gray-600 print:text-gray-700">{loc.notes ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        );
      })()}

      {/* Timeline */}
      {order.timelineItems.length > 0 && (
        <Section title="Timeline">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Label</th>
                <th className="pb-1 pr-4 font-medium">Start</th>
                <th className="pb-1 pr-4 font-medium">End</th>
                <th className="pb-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {order.timelineItems.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{item.label}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{formatTime(item.startTime)}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{formatTime(item.endTime)}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700">{item.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Menu */}
      {order.menuSections.length > 0 && (
        <Section title="Menu">
          {order.menuSections.map((section) => (
            <div key={section.id} className="mb-4">
              {section.responsiblePartyVendor && (
                <p className="text-xs text-gray-500 print:text-gray-600 mb-1">
                  By: {section.responsiblePartyVendor.name}
                </p>
              )}
              <div
                className="text-sm text-gray-700 print:text-black prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: section.menuContent }}
              />
              {section.notes && (
                <p className="text-xs text-gray-500 print:text-gray-600 mt-1">{section.notes}</p>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Equipment */}
      {order.equipmentItems.length > 0 && (
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
              {order.equipmentItems.map((e) => (
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

      {/* Line Items */}
      {order.lineItems.length > 0 && (
        <Section title="Contract Line Items">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Description</th>
                <th className="pb-1 pr-4 font-medium">Unit</th>
                <th className="pb-1 pr-4 font-medium">Unit Price</th>
                <th className="pb-1 pr-4 font-medium">Qty</th>
                <th className="pb-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((li) => (
                <tr key={li.id} className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">{li.description}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{li.unitType ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">
                    {li.unitPrice != null ? `$${li.unitPrice.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{li.quantity ?? "—"}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700">{li.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Contacts */}
      {order.contacts.length > 0 && (
        <Section title="Contacts">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Name</th>
                <th className="pb-1 pr-4 font-medium">Role</th>
                <th className="pb-1 pr-4 font-medium">Email</th>
                <th className="pb-1 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {order.contacts.map((oc) => (
                <tr key={oc.id} className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">
                    {oc.contact.firstName} {oc.contact.lastName}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{oc.role ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{oc.contact.email ?? "—"}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700">{oc.contact.phone ? formatPhone(oc.contact.phone) : "—"}</td>
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
