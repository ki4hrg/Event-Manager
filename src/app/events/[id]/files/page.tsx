import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getEvent } from "../../actions";
import { getOptions } from "@/app/settings/actions";
import { prisma } from "@/lib/prisma";
import { EventTabs } from "../EventTabs";

export const dynamic = "force-dynamic";

export default async function EventFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, fileTypeOptions, eventFiles] = await Promise.all([
    getEvent(id),
    getOptions("file_type"),
    prisma.fileUpload.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!event) {
    notFound();
  }

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

      <FileUploadPanel
        entityType="event"
        entityId={id}
        files={eventFiles}
        fileTypeOptions={fileTypeOptions}
        revalidateTarget={`/events/${id}/files`}
      />
    </PageWrapper>
  );
}
