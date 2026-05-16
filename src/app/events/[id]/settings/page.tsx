import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Toast } from "@/components/Toast";
import { PageHeader } from "@/components/PageHeader";
import { getEvent } from "../../actions";
import { getStatusDefaults, clearStatusDefault, saveAllStatusDefaults } from "@/app/events/status-defaults/actions";
import { getSubstatusOptions } from "@/app/settings/actions";
import { StatusDefaultsPanel } from "@/app/events/status-defaults/StatusDefaultsPanel";
import type { EntityStatus, StatusModelType } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, statusDefaults, substatuses] = await Promise.all([
    getEvent(id),
    getStatusDefaults(id),
    getSubstatusOptions(),
  ]);

  if (!event) notFound();

  const saveAllAction = async (
    overrides: Array<{ modelType: StatusModelType; status: EntityStatus; substatus: string | null }>
  ) => {
    "use server";
    await saveAllStatusDefaults(id, overrides);
  };

  const clearDefaultAction = async (modelType: StatusModelType) => {
    "use server";
    await clearStatusDefault(id, modelType);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${id}` },
          { label: "Settings" },
        ]}
        title="Event Settings"
      />

      <div className="max-w-2xl">
        <StatusDefaultsPanel
          defaults={statusDefaults}
          substatuses={substatuses}
          saveAll={saveAllAction}
          clearDefault={clearDefaultAction}
        />
      </div>
    </>
  );
}
