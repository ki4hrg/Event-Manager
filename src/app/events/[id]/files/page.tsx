import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getEvent } from "../../actions";
import { getOptions } from "@/app/settings/actions";
import { prisma } from "@/lib/prisma";
import { EventTabs } from "../EventTabs";
import { formatFileSize } from "@/lib/uploads";
import { getSetupOrderDisplayName } from "../../setup-orders/utils";

export const dynamic = "force-dynamic";

type OrderSummary = {
  id: string;
  displayName: string;
  files: {
    id: string;
    fileName: string;
    fileType: string | null;
    fileSize: number;
    createdAt: Date;
  }[];
};

function OrderFilesCard({
  title,
  orders,
  orderHref,
}: {
  title: string;
  orders: OrderSummary[];
  orderHref: (orderId: string) => string;
}) {
  const ordersWithFiles = orders.filter((o) => o.files.length > 0);
  if (ordersWithFiles.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h2>
      <div className="space-y-4">
        {ordersWithFiles.map((order) => (
          <div key={order.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {order.displayName}
              </span>
              <Link
                href={orderHref(order.id)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Manage
              </Link>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {order.files.map((file) => (
                <li key={file.id} className="py-2 flex items-center gap-3">
                  <div className="min-w-0">
                    <a
                      href={`/api/files/${file.id}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block"
                      title={file.fileName}
                    >
                      {file.fileName}
                    </a>
                    <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {file.fileType && <span>{file.fileType}</span>}
                      <span>{formatFileSize(file.fileSize)}</span>
                      <span>{file.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function EventFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, fileTypeOptions, eventFiles, avOrders, cateringOrders, setupOrders] =
    await Promise.all([
      getEvent(id),
      getOptions("file_type"),
      prisma.fileUpload.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" } }),
      prisma.aVOrder.findMany({
        where: { eventId: id },
        select: {
          id: true,
          name: true,
          files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.cateringOrder.findMany({
        where: { eventId: id },
        select: {
          id: true,
          name: true,
          files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.setupOrder.findMany({
        where: { eventId: id },
        select: {
          id: true,
          description: true,
          room: { select: { name: true } },
          function: { select: { name: true } },
          files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  if (!event) {
    notFound();
  }

  const avOrderSummaries: OrderSummary[] = avOrders.map((o) => ({
    id: o.id,
    displayName: o.name,
    files: o.files,
  }));

  const cateringOrderSummaries: OrderSummary[] = cateringOrders.map((o) => ({
    id: o.id,
    displayName: o.name,
    files: o.files,
  }));

  const setupOrderSummaries: OrderSummary[] = setupOrders.map((o) => ({
    id: o.id,
    displayName: getSetupOrderDisplayName(o),
    files: o.files,
  }));

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-4">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${id}` },
            { label: "Files" },
          ]} />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
      </div>

      <EventTabs eventId={id} />

      <div className="space-y-6">
        <FileUploadPanel
          entityType="event"
          entityId={id}
          files={eventFiles}
          fileTypeOptions={fileTypeOptions}
          revalidateTarget={`/events/${id}/files`}
          title="Event Files"
        />

        <OrderFilesCard
          title="AV Order Files"
          orders={avOrderSummaries}
          orderHref={(orderId) => `/events/${id}/av-orders/${orderId}`}
        />

        <OrderFilesCard
          title="Catering Order Files"
          orders={cateringOrderSummaries}
          orderHref={(orderId) => `/events/${id}/catering-orders/${orderId}`}
        />

        <OrderFilesCard
          title="Setup Order Files"
          orders={setupOrderSummaries}
          orderHref={(orderId) => `/events/${id}/setup-orders/${orderId}`}
        />
      </div>
    </PageWrapper>
  );
}
