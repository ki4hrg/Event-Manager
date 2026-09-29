import type {
  PackingListData,
  PackingListOrderBlock,
  PackingListRoomSection,
  PackingProcurementGroup,
} from "@/app/events/reports/actions";
import type { PackableItem } from "@/lib/packingItems";
import { EmptyState } from "@/components/EmptyState";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import {
  ACQUISITION_LABEL,
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
  PACKING_STATUS_OPTIONS,
  ACQUISITION_OPTIONS,
} from "@/lib/statusConstants";

function StatusPill({ item }: { item: PackableItem }) {
  return (
    <span
      className={`inline-block text-xs rounded px-2 py-0.5 font-medium ${PACKING_STATUS_CLASS[item.packingStatus]}`}
    >
      {PACKING_STATUS_LABEL[item.packingStatus]}
    </span>
  );
}

function AcquisitionText({ item }: { item: PackableItem }) {
  const needsBuying = item.acquisitionState === "TO_PROCURE";
  return (
    <span
      className={
        needsBuying
          ? "text-amber-700 dark:text-amber-400 print:text-gray-900 font-medium"
          : "text-gray-600 dark:text-gray-400 print:text-gray-700"
      }
    >
      {ACQUISITION_LABEL[item.acquisitionState]}
    </span>
  );
}

/** Per-item provider is only worth a line when it overrides the order's. */
function providerOverride(item: PackableItem, orderProvider: string | null): string | null {
  if (!item.itemProvider) return null;
  if (item.itemProvider === orderProvider) return null;
  return item.itemProvider;
}

function ItemMobileCard({
  item,
  orderProvider,
}: {
  item: PackableItem;
  orderProvider: string | null;
}) {
  const override = providerOverride(item, orderProvider);
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white break-words">
            {item.description}
            {item.containerLocationId && (
              <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                (container)
              </span>
            )}
          </p>
          {item.equipmentCategory && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {item.equipmentCategory}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
          <p className="text-gray-900 dark:text-white">{item.quantity ?? "—"}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <StatusPill item={item} />
        <AcquisitionText item={item} />
      </div>
      {(override || item.sourceLocationPath) && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 space-y-0.5 break-words">
          {override && <p>Provider: {override}</p>}
          {item.sourceLocationPath && <p>Storage: {item.sourceLocationPath}</p>}
        </div>
      )}
      {item.notes && (
        <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400 break-words">
          {item.notes}
        </p>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: PackingListOrderBlock }) {
  const context = [...order.functionNames, ...order.presentationNames];

  return (
    <div
      id={order.anchorId}
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden print:break-inside-avoid print:border-gray-300 scroll-mt-24"
    >
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 print:bg-gray-100 border-b border-gray-200 dark:border-gray-700 print:border-gray-300">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h4 className="min-w-0 break-words text-sm font-semibold text-gray-900 dark:text-white print:text-black">
            {order.orderName}
          </h4>
          <span className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
            {order.kind === "SUPPLY" ? "Supply order" : "Print order"}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 print:text-gray-700 space-y-0.5 break-words">
          <p>Provider: {order.provider ?? "—"}</p>
          {order.specificLocation && <p>Placement: {order.specificLocation}</p>}
          {context.length > 0 && <p>For: {context.join(", ")}</p>}
        </div>
      </div>

      <div className="sm:hidden print:hidden divide-y divide-gray-100 dark:divide-gray-700">
        {order.items.map((item) => (
          <ItemMobileCard key={item.itemId} item={item} orderProvider={order.provider} />
        ))}
      </div>

      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 print:border-gray-300 bg-white dark:bg-gray-800 print:bg-white">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700">
                Item
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700 w-16">
                Qty
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700 w-28">
                Packing
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700 w-28">
                Acquisition
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700 w-40">
                Provider
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 print:divide-gray-200">
            {order.items.map((item) => {
              const override = providerOverride(item, order.provider);
              return (
                <tr key={item.itemId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 align-top">
                    <span className="font-medium text-gray-900 dark:text-white print:text-black">
                      {item.description}
                    </span>
                    {item.containerLocationId && (
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
                        (container)
                      </span>
                    )}
                    {item.equipmentCategory && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
                        {item.equipmentCategory}
                      </span>
                    )}
                    {item.sourceLocationPath && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
                        Storage: {item.sourceLocationPath}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right align-top text-gray-900 dark:text-white print:text-black">
                    {item.quantity ?? "—"}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <StatusPill item={item} />
                  </td>
                  <td className="px-4 py-2 align-top text-xs">
                    <AcquisitionText item={item} />
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-gray-600 dark:text-gray-400 print:text-gray-700">
                    {override ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                  </td>
                  <td className="px-4 py-2 align-top text-xs italic text-gray-500 dark:text-gray-400 print:text-gray-600">
                    {item.notes ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoomCard({ section }: { section: PackingListRoomSection }) {
  return (
    <div
      id={section.anchorId}
      className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden print:shadow-none print:rounded-none scroll-mt-24"
    >
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 print:border-gray-400">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white print:text-black break-words">
          {section.roomName}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mt-0.5">
          {section.venueName ? `${section.venueName} · ` : ""}
          {section.itemCount} item{section.itemCount !== 1 ? "s" : ""} ·{" "}
          {section.orders.length} order{section.orders.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="p-4 sm:p-6 space-y-4">
        {section.orders.map((order) => (
          <OrderCard key={`${order.kind}-${order.orderId}`} order={order} />
        ))}
      </div>
    </div>
  );
}

function ProcurementCard({ group }: { group: PackingProcurementGroup }) {
  return (
    <div
      id={group.anchorId}
      className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden print:shadow-none print:rounded-none print:break-inside-avoid scroll-mt-24"
    >
      <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 print:border-gray-400">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white print:text-black">
          {group.provider ?? "No provider assigned"}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mt-0.5">
          {group.rows.length} item{group.rows.length !== 1 ? "s" : ""} to procure
        </p>
      </div>

      <div className="sm:hidden print:hidden divide-y divide-gray-100 dark:divide-gray-700">
        {group.rows.map(({ item, roomName, orderName }) => (
          <div key={item.itemId} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white break-words">
                {item.description}
              </p>
              <span className="shrink-0 text-xs text-gray-900 dark:text-white">
                {item.quantity ?? "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
              {roomName ?? "No room assigned"} · {orderName}
            </p>
            <div className="mt-1">
              <StatusPill item={item} />
            </div>
            {item.notes && (
              <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400 break-words">
                {item.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 print:border-gray-300 bg-gray-50 dark:bg-gray-900 print:bg-gray-100">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700">
                Item
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700 w-16">
                Qty
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700 w-48">
                Destination
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700 w-28">
                Packing
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-700">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 print:divide-gray-200">
            {group.rows.map(({ item, roomName, orderName }) => (
              <tr key={item.itemId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-2 align-top font-medium text-gray-900 dark:text-white print:text-black">
                  {item.description}
                </td>
                <td className="px-4 py-2 align-top text-right text-gray-900 dark:text-white print:text-black">
                  {item.quantity ?? "—"}
                </td>
                <td className="px-4 py-2 align-top text-xs text-gray-600 dark:text-gray-400 print:text-gray-700">
                  {roomName ?? "No room assigned"}
                  <span className="block text-gray-500 dark:text-gray-500">{orderName}</span>
                </td>
                <td className="px-4 py-2 align-top">
                  <StatusPill item={item} />
                </td>
                <td className="px-4 py-2 align-top text-xs italic text-gray-500 dark:text-gray-400 print:text-gray-600">
                  {item.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryBand({ data }: { data: PackingListData }) {
  const { summary } = data;
  const tiles: { label: string; value: number; emphasis?: boolean }[] = [
    { label: "Orders", value: summary.orderCount },
    { label: "Items", value: summary.itemCount },
    ...PACKING_STATUS_OPTIONS.map((o) => ({
      label: o.label,
      value: summary.byPackingStatus[o.value],
    })),
    { label: "To Procure", value: summary.toProcureCount, emphasis: true },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 print:shadow-none print:rounded-none print:break-inside-avoid">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <p
              className={`text-2xl font-semibold ${
                tile.emphasis && tile.value > 0
                  ? "text-amber-700 dark:text-amber-400 print:text-black"
                  : "text-gray-900 dark:text-white print:text-black"
              }`}
            >
              {tile.value}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
              {tile.label}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
        Acquisition:{" "}
        {ACQUISITION_OPTIONS.map(
          (o) => `${summary.byAcquisitionState[o.value]} ${o.label.toLowerCase()}`
        ).join(" · ")}
      </p>
    </div>
  );
}

type PackingListReportProps = {
  data: PackingListData;
};

export function PackingListReport({ data }: PackingListReportProps) {
  const { roomSections, procurement } = data;

  if (roomSections.length === 0 && procurement.length === 0) {
    return <EmptyState message="No items." />;
  }

  const sections = [
    { id: "summary", label: "Summary" },
    { id: "destinations", label: "Destinations" },
    { id: "procurement", label: "Procurement" },
  ];
  const itemGroups = [
    {
      label: "Rooms",
      links: roomSections.map((s) => ({ id: s.anchorId, label: s.roomName })),
    },
  ];

  return (
    <div className="space-y-6">
      <ReportNav sections={sections} itemGroups={itemGroups} />

      <SectionDivider id="summary" title="Summary" />
      <SummaryBand data={data} />

      <SectionDivider id="destinations" title="Destinations" />
      {roomSections.length === 0 ? (
        <EmptyState message="No items match the selected filters." />
      ) : (
        roomSections.map((section) => <RoomCard key={section.anchorId} section={section} />)
      )}

      <SectionDivider id="procurement" title="Procurement" />
      {procurement.length === 0 ? (
        <EmptyState message="All items procured." />
      ) : (
        procurement.map((group) => <ProcurementCard key={group.anchorId} group={group} />)
      )}
    </div>
  );
}
