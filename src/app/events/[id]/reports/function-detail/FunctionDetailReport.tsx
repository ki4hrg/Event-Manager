import type {
  FunctionDetailData,
  FunctionDetailFunction,
} from "@/app/events/reports/actions";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { EmptyState } from "@/components/EmptyState";
import { LastUpdated } from "@/components/LastUpdated";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { cateringRelationshipLabel, type CateringRelationship } from "@/lib/cateringServiceLocations";
import { formatPhone } from "@/lib/format-phone";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { STATUS_LABEL, STATUS_CLASS } from "@/lib/statusConstants";
import { formatTime, formatDateTime, getDateKeyInTimezone } from "@/lib/agendaUtils";
import { resolveAdvancer } from "@/lib/presentationAdvancer";
import { partyLabel } from "@/lib/partyLabel";

type OptionList = { label: string; color?: string | null }[];

type Props = {
  data: FunctionDetailData;
  functionTypes: OptionList;
  scheduleTypes: OptionList;
  serviceStyles: OptionList;
  setupTypes: OptionList;
};

type Fn = FunctionDetailFunction;
type AvOrder = Fn["avOrderFunctions"][number]["avOrder"];
type SetupOrder = Fn["setupOrderFunctions"][number]["setupOrder"];
type PrintOrder = Fn["printOrderFunctions"][number]["printOrder"];
type MediaDeliverable = Fn["mediaDeliverableFunctions"][number]["mediaDeliverable"];
type CateringOrder = NonNullable<Fn["cateringOrder"]>;
type EquipmentItem = AvOrder["equipmentItems"][number];
type InputGroupT = NonNullable<AvOrder["audioSection"]>["inputGroups"][number];
type MonitorMixT = NonNullable<AvOrder["audioSection"]>["monitorMixes"][number];
type PresentationSlot = Fn["presentationSlots"][number];

// Mobile schedule row pairs the start datetime with a bare end time on the same
// day, or with a full end datetime when the schedule crosses midnight so
// multi-day blocks don't silently lose the boundary.
function formatScheduleEndTime(start: Date, end: Date, timezone: string): string {
  if (getDateKeyInTimezone(start, timezone) !== getDateKeyInTimezone(end, timezone)) {
    return formatDateTime(end, timezone);
  }
  return formatTime(end, timezone);
}

function vendorOrContactName(
  vendor?: { name: string } | null,
  contact?: { firstName: string; lastName: string } | null,
): string | null {
  if (vendor) return vendor.name;
  if (contact) return `${contact.firstName} ${contact.lastName}`;
  return null;
}

function StatusBadge({ status }: { status: Fn["status"] }) {
  if (!status) return null;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function VendorPills({
  vendors,
}: {
  vendors: { vendor: { id: string; name: string } }[];
}) {
  if (vendors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {vendors.map((v) => (
        <span
          key={v.vendor.id}
          className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          {v.vendor.name}
        </span>
      ))}
    </div>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h4>
      {children}
    </section>
  );
}

function EquipmentTable({ items }: { items: EquipmentItem[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {items.map((it) => (
          <div key={it.id} className="p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {it.equipment?.name ?? it.item}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                Qty {it.quantity ?? 1}
              </span>
            </div>
            <div className="text-gray-500 dark:text-gray-400 mt-0.5">
              {it.equipment?.category && <span>{it.equipment.category}</span>}
              {vendorOrContactName(it.providerVendor, it.providerContact) && (
                <span>
                  {" "}· Provider:{" "}
                  {vendorOrContactName(it.providerVendor, it.providerContact)}
                </span>
              )}
              {vendorOrContactName(it.operatorVendor, it.operatorContact) && (
                <span>
                  {" "}· Operator:{" "}
                  {vendorOrContactName(it.operatorVendor, it.operatorContact)}
                </span>
              )}
            </div>
            {it.notes && (
              <p className="italic text-gray-500 dark:text-gray-400 mt-0.5">
                {it.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="py-1.5 pr-3 text-xs font-medium">Item</th>
              <th className="py-1.5 pr-3 text-xs font-medium">Category</th>
              <th className="py-1.5 pr-3 text-xs font-medium text-right w-16">Qty</th>
              <th className="py-1.5 pr-3 text-xs font-medium">Provider</th>
              <th className="py-1.5 pr-3 text-xs font-medium">Operator</th>
              <th className="py-1.5 text-xs font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                className="border-b border-gray-100 dark:border-gray-800 align-top"
              >
                <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                  {it.equipment?.name ?? it.item}
                </td>
                <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400">
                  {it.equipment?.category ?? "—"}
                </td>
                <td className="py-1.5 pr-3 text-right text-gray-900 dark:text-gray-100">
                  {it.quantity ?? 1}
                </td>
                <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                  {vendorOrContactName(it.providerVendor, it.providerContact) ?? "—"}
                </td>
                <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                  {vendorOrContactName(it.operatorVendor, it.operatorContact) ?? "—"}
                </td>
                <td className="py-1.5 text-gray-500 dark:text-gray-400 italic">
                  {it.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InputGroupBlock({ group }: { group: InputGroupT }) {
  return (
    <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-3 mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {group.name}
        </span>
        {vendorOrContactName(group.providerVendor, group.providerContact) && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Provider:{" "}
            {vendorOrContactName(group.providerVendor, group.providerContact)}
          </span>
        )}
      </div>
      {group.notes && (
        <p className="text-xs italic text-gray-500 dark:text-gray-400 mt-0.5">
          {group.notes}
        </p>
      )}
      {group.inputItems.length > 0 && (
        <ul className="text-xs text-gray-700 dark:text-gray-300 mt-1 space-y-0.5">
          {group.inputItems.map((it) => {
            const provider = vendorOrContactName(
              it.providerVendor,
              it.providerContact,
            );
            return (
              <li key={it.id}>
                <span className="text-gray-900 dark:text-gray-100">
                  {it.quantity > 1 ? `${it.quantity}× ` : ""}
                  {it.equipment?.name ?? it.description}
                </span>
                {provider && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {" "}· {provider}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MonitorMixBlock({ mix }: { mix: MonitorMixT }) {
  return (
    <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-3 mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {mix.description}
        </span>
        {vendorOrContactName(mix.providerVendor, mix.providerContact) && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Provider:{" "}
            {vendorOrContactName(mix.providerVendor, mix.providerContact)}
          </span>
        )}
      </div>
      {mix.equipment?.name && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {mix.equipment.name}
        </p>
      )}
      {mix.monitorOutputs.length > 0 && (
        <ul className="text-xs text-gray-700 dark:text-gray-300 mt-1 space-y-0.5">
          {mix.monitorOutputs.map((out) => {
            const provider = vendorOrContactName(
              out.providerVendor,
              out.providerContact,
            );
            return (
              <li key={out.id}>
                <span className="text-gray-900 dark:text-gray-100">
                  {out.quantity > 1 ? `${out.quantity}× ` : ""}
                  {out.equipment?.name ?? "Output"}
                </span>
                {provider && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {" "}· {provider}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AVOrderCard({ order }: { order: AvOrder }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {order.name}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <VendorPills vendors={order.vendors} />
      </div>
      <LastUpdated updatedAt={order.updatedAt} updatedBy={order.updatedBy} className="mb-2 print:hidden" />
      {order.notes && (
        <p className="text-xs italic text-gray-600 dark:text-gray-400 mb-2">
          {order.notes}
        </p>
      )}

      {order.audioSection &&
        (order.audioSection.inputGroups.length > 0 ||
          order.audioSection.monitorMixes.length > 0) && (
          <SubSection title="Audio">
            {order.audioSection.inputGroups.map((g) => (
              <InputGroupBlock key={g.id} group={g} />
            ))}
            {order.audioSection.monitorMixes.map((m) => (
              <MonitorMixBlock key={m.id} mix={m} />
            ))}
          </SubSection>
        )}

      {order.videoSection && order.videoSection.equipmentItems.length > 0 && (
        <SubSection title="Video">
          <EquipmentTable items={order.videoSection.equipmentItems} />
        </SubSection>
      )}

      {order.equipmentItems.length > 0 && (
        <SubSection title="Equipment">
          <EquipmentTable items={order.equipmentItems} />
        </SubSection>
      )}
    </div>
  );
}

function SetupOrderCard({
  order,
  setupTypes,
}: {
  order: SetupOrder;
  setupTypes: OptionList;
}) {
  const setupTypeLabel = order.setupType
    ? resolveOptionLabel(order.setupType, setupTypes)
    : null;
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {order.name ?? "Setup Order"}
          </span>
          <StatusBadge status={order.status} />
          {setupTypeLabel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {setupTypeLabel}
            </span>
          )}
          {order.room && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Room: {order.room.name}
            </span>
          )}
        </div>
        <VendorPills vendors={order.vendors} />
      </div>
      <LastUpdated updatedAt={order.updatedAt} updatedBy={order.updatedBy} className="mb-2 print:hidden" />
      {order.notes && (
        <p className="text-xs italic text-gray-600 dark:text-gray-400 mb-2">
          {order.notes}
        </p>
      )}

      {order.details.length > 0 && (
        <SubSection title="Details">
          <div className="space-y-2">
            {order.details.map((detail) => (
              <div key={detail.id}>
                {(detail.headline || detail.responsiblePartyVendor) && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {detail.headline && (
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                        {detail.headline}
                      </p>
                    )}
                    {detail.responsiblePartyVendor && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        By: {detail.responsiblePartyVendor.name}
                      </p>
                    )}
                  </div>
                )}
                {/* RichTextEditor output — chain: SetupOrderDetailTable → RichTextEditor */}
                <div
                  className="text-xs text-gray-700 dark:text-gray-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                  dangerouslySetInnerHTML={{ __html: detail.description }}
                />
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {order.tables.length > 0 && (
        <SubSection title="Tables">
          <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            {order.tables.map((t) => (
              <div key={t.id} className="p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {t.quantity}× {t.tableType ?? "Table"}
                  </span>
                  {t.providerVendor && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {t.providerVendor.name}
                    </span>
                  )}
                </div>
                {(t.chairCount || t.chairType) && (
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                    {t.chairCount ? `${t.chairCount} ` : ""}
                    {t.chairType ?? "Chairs"}
                  </p>
                )}
                {t.notes && (
                  <p className="italic text-gray-500 dark:text-gray-400 mt-0.5">
                    {t.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="hidden sm:block print:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-1.5 pr-3 text-xs font-medium text-right w-16">
                    Qty
                  </th>
                  <th className="py-1.5 pr-3 text-xs font-medium">Type</th>
                  <th className="py-1.5 pr-3 text-xs font-medium">Chairs</th>
                  <th className="py-1.5 pr-3 text-xs font-medium">Provider</th>
                  <th className="py-1.5 text-xs font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {order.tables.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-gray-100 dark:border-gray-800 align-top"
                  >
                    <td className="py-1.5 pr-3 text-right text-gray-900 dark:text-gray-100">
                      {t.quantity}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                      {t.tableType ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                      {t.chairCount ? `${t.chairCount} ${t.chairType ?? ""}`.trim() : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                      {t.providerVendor?.name ?? "—"}
                    </td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-400 italic">
                      {t.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubSection>
      )}

      {order.equipmentItems.length > 0 && (
        <SubSection title="Equipment">
          <EquipmentTable items={order.equipmentItems} />
        </SubSection>
      )}
    </div>
  );
}

function PrintOrderCard({ order }: { order: PrintOrder }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {order.name}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <VendorPills vendors={order.vendors} />
      </div>
      <LastUpdated updatedAt={order.updatedAt} updatedBy={order.updatedBy} className="mb-2 print:hidden" />
      {order.notes && (
        <p className="text-xs italic text-gray-600 dark:text-gray-400 mb-2">
          {order.notes}
        </p>
      )}

      {order.items.length > 0 && (
        <>
          <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            {order.items.map((it) => (
              <div key={it.id} className="p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {it.description}
                  </span>
                  {it.quantity != null && (
                    <span className="text-gray-500 dark:text-gray-400">
                      Qty {it.quantity}
                    </span>
                  )}
                </div>
                {vendorOrContactName(it.designerVendor, it.designerContact) && (
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                    Designer:{" "}
                    {vendorOrContactName(it.designerVendor, it.designerContact)}
                  </p>
                )}
                {vendorOrContactName(it.printerVendor, it.printerContact) && (
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                    Printer:{" "}
                    {vendorOrContactName(it.printerVendor, it.printerContact)}
                  </p>
                )}
                {it.distributionMethod && (
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                    Distribution: {it.distributionMethod}
                  </p>
                )}
                {it.notes && (
                  <p className="italic text-gray-500 dark:text-gray-400 mt-0.5">
                    {it.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="hidden sm:block print:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-1.5 pr-3 text-xs font-medium">Item</th>
                  <th className="py-1.5 pr-3 text-xs font-medium text-right w-16">
                    Qty
                  </th>
                  <th className="py-1.5 pr-3 text-xs font-medium">Designer</th>
                  <th className="py-1.5 pr-3 text-xs font-medium">Printer</th>
                  <th className="py-1.5 pr-3 text-xs font-medium">Distribution</th>
                  <th className="py-1.5 text-xs font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-b border-gray-100 dark:border-gray-800 align-top"
                  >
                    <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                      {it.description}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-900 dark:text-gray-100">
                      {it.quantity ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                      {vendorOrContactName(it.designerVendor, it.designerContact) ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                      {vendorOrContactName(it.printerVendor, it.printerContact) ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                      {it.distributionMethod ?? "—"}
                    </td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-400 italic">
                      {it.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MediaDeliverableCard({ deliverable }: { deliverable: MediaDeliverable }) {
  const providedBy = partyLabel(deliverable.providerVendor, deliverable.providerContact);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">{deliverable.name}</span>
          <StatusBadge status={deliverable.status} />
          {deliverable.mediaType && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{deliverable.mediaType}</span>
          )}
        </div>
      </div>
      <LastUpdated updatedAt={deliverable.updatedAt} updatedBy={deliverable.updatedBy} className="mb-2 print:hidden" />
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs text-gray-700 dark:text-gray-300 mb-2">
        {providedBy && (
          <>
            <dt className="font-medium">Provider:</dt>
            <dd>{providedBy}</dd>
          </>
        )}
        {deliverable.delivery && (
          <>
            <dt className="font-medium">Delivery:</dt>
            <dd>{deliverable.delivery}</dd>
          </>
        )}
      </dl>
      {deliverable.description && (
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2 whitespace-pre-wrap">{deliverable.description}</p>
      )}
      {deliverable.notes && (
        <p className="text-xs italic text-gray-600 dark:text-gray-400 mb-2 whitespace-pre-wrap">{deliverable.notes}</p>
      )}
    </div>
  );
}

function CateringSection({
  catering,
  timezone,
  serviceStyles,
  relationship,
}: {
  catering: CateringOrder;
  timezone: string;
  serviceStyles: OptionList;
  relationship?: CateringRelationship;
}) {
  const serviceStyleLabel = catering.serviceStyle
    ? resolveOptionLabel(catering.serviceStyle, serviceStyles)
    : null;
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {catering.name}
          </span>
          <StatusBadge status={catering.status} />
          {relationship && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {cateringRelationshipLabel(relationship)}
            </span>
          )}
          {serviceStyleLabel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {serviceStyleLabel}
            </span>
          )}
        </div>
        <VendorPills vendors={catering.vendors} />
      </div>
      <LastUpdated updatedAt={catering.updatedAt} updatedBy={catering.updatedBy} className="mb-2 print:hidden" />

      <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {catering.expectedCount != null && (
          <span>
            Expected:{" "}
            <span className="text-gray-900 dark:text-gray-100">
              {catering.expectedCount}
            </span>
          </span>
        )}
        {catering.confirmedCount != null && (
          <span>
            Confirmed:{" "}
            <span className="text-gray-900 dark:text-gray-100">
              {catering.confirmedCount}
            </span>
          </span>
        )}
        {catering.guaranteeCount != null && (
          <span>
            Guarantee:{" "}
            <span className="text-gray-900 dark:text-gray-100">
              {catering.guaranteeCount}
            </span>
          </span>
        )}
      </div>

      {catering.notes && (
        <p className="text-xs italic text-gray-600 dark:text-gray-400 mb-2">
          {catering.notes}
        </p>
      )}
      {catering.dietaryNotes && (
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          <span className="font-medium">Dietary notes:</span>{" "}
          {catering.dietaryNotes}
        </p>
      )}
      {catering.staffingNotes && (
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          <span className="font-medium">Staffing:</span> {catering.staffingNotes}
        </p>
      )}

      {catering.lineItems.length > 0 && (
        <SubSection title="Line Items">
          <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            {catering.lineItems.map((li) => (
              <div key={li.id} className="p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {li.description}
                  </span>
                  {li.quantity != null && (
                    <span className="text-gray-500 dark:text-gray-400">
                      Qty {li.quantity} {li.unitType ?? ""}
                    </span>
                  )}
                </div>
                {li.notes && (
                  <p className="italic text-gray-500 dark:text-gray-400 mt-0.5">
                    {li.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="hidden sm:block print:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-1.5 pr-3 text-xs font-medium">Item</th>
                  <th className="py-1.5 pr-3 text-xs font-medium text-right w-16">
                    Qty
                  </th>
                  <th className="py-1.5 pr-3 text-xs font-medium">Unit</th>
                  <th className="py-1.5 text-xs font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {catering.lineItems.map((li) => (
                  <tr
                    key={li.id}
                    className="border-b border-gray-100 dark:border-gray-800 align-top"
                  >
                    <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                      {li.description}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-900 dark:text-gray-100">
                      {li.quantity ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                      {li.unitType ?? "—"}
                    </td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-400 italic">
                      {li.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubSection>
      )}

      {catering.menuSections.length > 0 && (
        <SubSection title="Menu">
          <div className="space-y-3">
            {catering.menuSections.map((ms) => (
              <div
                key={ms.id}
                className="border border-gray-200 dark:border-gray-700 rounded p-3 print:break-inside-avoid"
              >
                {ms.responsiblePartyVendor && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Responsible: {ms.responsiblePartyVendor.name}
                  </p>
                )}
                {/* menuContent is produced by RichTextEditor (tiptap) — see src/components/RichTextEditor.tsx */}
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: ms.menuContent }}
                />
                {ms.notes && (
                  <p className="text-xs italic text-gray-500 dark:text-gray-400 mt-1">
                    {ms.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {catering.equipmentItems.length > 0 && (
        <SubSection title="Equipment & Rentals">
          <EquipmentTable items={catering.equipmentItems} />
        </SubSection>
      )}

      {catering.timelineItems.length > 0 && (
        <SubSection title="Timeline">
          <div className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
            {catering.timelineItems.map((ti) => (
              <div key={ti.id} className="flex gap-3">
                <span className="text-gray-500 dark:text-gray-400 shrink-0">
                  {formatTime(ti.startTime, timezone)}
                  {ti.endTime
                    ? ` – ${formatTime(ti.endTime, timezone)}`
                    : ""}
                </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {ti.label}
                </span>
                {ti.notes && (
                  <span className="italic text-gray-500 dark:text-gray-400">
                    {ti.notes}
                  </span>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}
    </div>
  );
}

function PresentationCard({
  slot,
  setupTypes,
}: {
  slot: PresentationSlot;
  setupTypes: OptionList;
}) {
  const p = slot.presentation;
  const anchorId = `presentation-${p.id}`;
  const avOrders = p.avOrderLinks.map((l) => l.avOrder);
  const setupOrders = p.setupOrderLinks.map((l) => l.setupOrder);
  const mediaDeliverables = p.mediaDeliverableLinks.map((l) => l.mediaDeliverable);
  return (
    <div
      id={anchorId}
      className="border border-gray-300 dark:border-gray-600 rounded p-3 mb-3 print:break-inside-avoid scroll-mt-24"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {p.title}
          </p>
          {p.speakers.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {p.speakers
                .map((s) => `${s.contact.firstName} ${s.contact.lastName}`)
                .join(", ")}
            </p>
          )}
          {(() => {
            const resolved = resolveAdvancer(
              { advancerVendor: p.advancerVendor, advancerContact: p.advancerContact },
              slot,
            );
            const label = partyLabel(resolved.vendor, resolved.contact);
            if (!label) return null;
            return (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Advancer: {label}
                {resolved.source === "slot" && (
                  <span className="ml-1 text-amber-700 dark:text-amber-400">(override)</span>
                )}
              </p>
            );
          })()}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          <StatusBadge status={p.status} />
          {slot.room && <span>Room: {slot.room.name}</span>}
          {p.track && <span>Track: {p.track.name}</span>}
        </div>
      </div>
      {p.description && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          {p.description}
        </p>
      )}

      {avOrders.length > 0 && (
        <SubSection title="AV">
          {avOrders.map((o) => (
            <AVOrderCard key={o.id} order={o} />
          ))}
        </SubSection>
      )}
      {setupOrders.length > 0 && (
        <SubSection title="Setup">
          {setupOrders.map((o) => (
            <SetupOrderCard key={o.id} order={o} setupTypes={setupTypes} />
          ))}
        </SubSection>
      )}
      {p.printOrder && (
        <SubSection title="Print">
          <PrintOrderCard order={p.printOrder} />
        </SubSection>
      )}
      {mediaDeliverables.length > 0 && (
        <SubSection title="Media">
          {mediaDeliverables.map((d) => (
            <MediaDeliverableCard key={d.id} deliverable={d} />
          ))}
        </SubSection>
      )}
    </div>
  );
}

function WorkflowBlock({ instances }: { instances: Fn["workflowInstances"] }) {
  if (instances.length === 0) return null;
  return (
    <div className="space-y-3">
      {instances.map((inst) => {
        const stepIds = new Set(inst.stepCompletions.map((c) => c.stepId));
        const itemIds = new Set(inst.itemCompletions.map((c) => c.itemId));
        return (
          <div
            key={inst.id}
            className="border border-gray-200 dark:border-gray-700 rounded p-3 print:break-inside-avoid"
          >
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
              {inst.template.name}
            </p>
            {inst.template.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {inst.template.description}
              </p>
            )}
            <ul className="text-sm space-y-0.5">
              {inst.template.steps
                ?.sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => (
                  <li
                    key={s.id}
                    className="text-gray-700 dark:text-gray-300 flex items-baseline gap-2"
                  >
                    <span
                      className={
                        stepIds.has(s.id)
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-400"
                      }
                    >
                      {stepIds.has(s.id) ? "✓" : "○"}
                    </span>
                    <span
                      className={
                        stepIds.has(s.id)
                          ? "text-gray-900 dark:text-gray-100"
                          : ""
                      }
                    >
                      {s.label}
                    </span>
                  </li>
                ))}
            </ul>
            {itemIds.size > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {itemIds.size} checklist item{itemIds.size === 1 ? "" : "s"} complete
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}


function FunctionBlock({
  fn,
  timezone,
  functionTypes,
  scheduleTypes,
  serviceStyles,
  setupTypes,
}: {
  fn: Fn;
  timezone: string;
  functionTypes: OptionList;
  scheduleTypes: OptionList;
  serviceStyles: OptionList;
  setupTypes: OptionList;
}) {
  const displayName = formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name);
  const typeLabel = fn.type ? resolveOptionLabel(fn.type, functionTypes) : "";
  const anchorId = `function-${fn.id}`;
  const avOrders = fn.avOrderFunctions.map((l) => l.avOrder);
  const setupOrders = fn.setupOrderFunctions.map((l) => l.setupOrder);
  const printOrders = fn.printOrderFunctions.map((l) => l.printOrder);
  const mediaDeliverables = fn.mediaDeliverableFunctions.map((l) => l.mediaDeliverable);

  return (
    <section id={anchorId} className="scroll-mt-24 print:break-inside-avoid-page">
      <SectionDivider id={`${anchorId}-divider`} title={displayName} />

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex flex-wrap items-baseline gap-2 mb-2">
            {typeLabel && (
              <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {typeLabel}
              </span>
            )}
            <StatusBadge status={fn.status} />
            {fn.substatus && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {fn.substatus}
              </span>
            )}
          </div>
          <LastUpdated updatedAt={fn.updatedAt} updatedBy={fn.updatedBy} timezone={timezone} className="mb-2 print:hidden" />
          {fn.description && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
              {fn.description}
            </p>
          )}
          {fn.notes && (
            <p className="text-sm italic text-gray-600 dark:text-gray-400 mb-1">
              {fn.notes}
            </p>
          )}
          {fn.rooms.length > 0 ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Rooms:</span>{" "}
              {fn.rooms.map((r) => r.room.name).join(", ")}
            </p>
          ) : fn.offSiteLocation ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Off-site:</span> {fn.offSiteLocation}
            </p>
          ) : null}
        </div>

        {fn.schedules.length > 0 && (
          <SubSection title="Schedule">
            <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
              {fn.schedules.map((s) => (
                <div key={s.id} className="p-2">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {resolveOptionLabel(s.type, scheduleTypes) || s.type || "—"}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {formatDateTime(s.startTime, timezone)} –{" "}
                    {formatScheduleEndTime(s.startTime, s.endTime, timezone)}
                  </p>
                  {s.notes && (
                    <p className="italic text-gray-500 dark:text-gray-400 mt-0.5">
                      {s.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden sm:block print:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-1.5 pr-3 text-xs font-medium">Type</th>
                    <th className="py-1.5 pr-3 text-xs font-medium">Start</th>
                    <th className="py-1.5 pr-3 text-xs font-medium">End</th>
                    <th className="py-1.5 text-xs font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {fn.schedules.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-gray-100 dark:border-gray-800 align-top"
                    >
                      <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                        {resolveOptionLabel(s.type, scheduleTypes) || s.type || "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                        {formatDateTime(s.startTime, timezone)}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                        {formatDateTime(s.endTime, timezone)}
                      </td>
                      <td className="py-1.5 text-gray-500 dark:text-gray-400 italic">
                        {s.notes ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>
        )}

        {fn.contacts.length > 0 && (
          <SubSection title="Contacts">
            <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
              {fn.contacts.map((fc) => (
                <div key={fc.id} className="p-2">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {fc.contact.firstName} {fc.contact.lastName}
                  </p>
                  {fc.role && (
                    <p className="text-gray-500 dark:text-gray-400">
                      {fc.role}
                    </p>
                  )}
                  {(fc.contact.email || fc.contact.phone) && (
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                      {fc.contact.email}
                      {fc.contact.email && fc.contact.phone ? " · " : ""}
                      {fc.contact.phone ? formatPhone(fc.contact.phone) : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden sm:block print:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-1.5 pr-3 text-xs font-medium">Name</th>
                    <th className="py-1.5 pr-3 text-xs font-medium">Role</th>
                    <th className="py-1.5 pr-3 text-xs font-medium">Email</th>
                    <th className="py-1.5 text-xs font-medium">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {fn.contacts.map((fc) => (
                    <tr
                      key={fc.id}
                      className="border-b border-gray-100 dark:border-gray-800 align-top"
                    >
                      <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                        {fc.contact.firstName} {fc.contact.lastName}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                        {fc.role ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                        {fc.contact.email ?? "—"}
                      </td>
                      <td className="py-1.5 text-gray-700 dark:text-gray-300">
                        {fc.contact.phone ? formatPhone(fc.contact.phone) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>
        )}

        {(() => {
          const primaryOrderId = fn.cateringOrder?.id ?? null;
          const additionalEntries = fn.cateringServiceLocations
            .filter((loc) => loc.cateringOrder.id !== primaryOrderId)
            .map((loc) => ({
              catering: loc.cateringOrder,
              relationship: {
                via: "ADDITIONAL_LOCATION" as const,
                locationName: loc.name,
              },
            }));
          if (!fn.cateringOrder && additionalEntries.length === 0) return null;
          return (
            <SubSection title="Catering">
              {fn.cateringOrder && (
                <CateringSection
                  catering={fn.cateringOrder}
                  timezone={timezone}
                  serviceStyles={serviceStyles}
                  relationship={{ via: "PRIMARY" }}
                />
              )}
              {additionalEntries.map((entry, idx) => (
                <CateringSection
                  key={`${entry.catering.id}-${idx}`}
                  catering={entry.catering}
                  timezone={timezone}
                  serviceStyles={serviceStyles}
                  relationship={entry.relationship}
                />
              ))}
            </SubSection>
          );
        })()}

        {avOrders.length > 0 && (
          <SubSection title="AV">
            {avOrders.map((o) => (
              <AVOrderCard key={o.id} order={o} />
            ))}
          </SubSection>
        )}

        {setupOrders.length > 0 && (
          <SubSection title="Setup">
            {setupOrders.map((o) => (
              <SetupOrderCard key={o.id} order={o} setupTypes={setupTypes} />
            ))}
          </SubSection>
        )}

        {printOrders.length > 0 && (
          <SubSection title="Print">
            {printOrders.map((o) => (
              <PrintOrderCard key={o.id} order={o} />
            ))}
          </SubSection>
        )}

        {mediaDeliverables.length > 0 && (
          <SubSection title="Media">
            {mediaDeliverables.map((d) => (
              <MediaDeliverableCard key={d.id} deliverable={d} />
            ))}
          </SubSection>
        )}

        {fn.presentationSlots.length > 0 && (
          <SubSection title="Presentations">
            {fn.presentationSlots.map((slot) => (
              <PresentationCard
                key={slot.id}
                slot={slot}
                setupTypes={setupTypes}
              />
            ))}
          </SubSection>
        )}

        {fn.workflowInstances.length > 0 && (
          <SubSection title="Workflow">
            <WorkflowBlock instances={fn.workflowInstances} />
          </SubSection>
        )}
      </div>
    </section>
  );
}

export function FunctionDetailReport({
  data,
  functionTypes,
  scheduleTypes,
  serviceStyles,
  setupTypes,
}: Props) {
  const { event, functions } = data;
  if (functions.length === 0) {
    return (
      <EmptyState message="No functions match the selected filters." />
    );
  }

  const functionLinks = functions.map((fn) => ({
    id: `function-${fn.id}`,
    label: formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name),
  }));

  return (
    <div className="space-y-6">
      <ReportNav itemGroups={[{ label: "Functions", links: functionLinks }]} />

      <div className="space-y-8">
        {functions.map((fn) => (
          <FunctionBlock
            key={fn.id}
            fn={fn}
            timezone={event.timezone}
            functionTypes={functionTypes}
            scheduleTypes={scheduleTypes}
            serviceStyles={serviceStyles}
            setupTypes={setupTypes}
          />
        ))}
      </div>
    </div>
  );
}
