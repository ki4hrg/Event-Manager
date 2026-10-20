import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Toast } from "@/components/Toast";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { requirePermission } from "@/lib/permissions";
import { getEvent, updateEvent, deleteEvent, getEventSeriesOptions } from "../../actions";
import { EventForm } from "../../EventForm";
import { getStatusDefaults, clearStatusDefault, saveAllStatusDefaults } from "@/app/events/status-defaults/actions";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";
import { updateEventAreas } from "../../actions";
import { EventAreasPanel } from "../../EventAreasPanel";
import { StatusDefaultsPanel } from "@/app/events/status-defaults/StatusDefaultsPanel";
import { getEventInboxAddress, setEventInboxSlug } from "@/app/events/inbox/actions";
import { InboxAddressPanel } from "@/app/events/inbox/InboxAddressPanel";
import type { EntityStatus, StatusModelType } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event settings" };

export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The page is edit-only end to end — event details, status defaults, delete —
  // so it gates as a whole rather than hiding three panels individually.
  const { tenantId } = await requirePermission("EVENTS", "WRITE", id);
  const [event, venues, series, statusDefaults, substatuses, regionOptions, areaOptions, inbox] = await Promise.all([
    getEvent(id),
    prisma.venue.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    getEventSeriesOptions(),
    getStatusDefaults(id),
    getSubstatusOptions(),
    getOptions("hotel_region"),
    getOptions("hotel_area"),
    getEventInboxAddress(id),
  ]);

  if (!event) notFound();

  const updateEventAction = async (formData: FormData) => {
    "use server";
    await updateEvent(id, formData);
  };

  const saveAreasAction = async (scope: { regions: string[]; areas: string[] }) => {
    "use server";
    await updateEventAreas(id, scope);
  };

  const saveInboxAction = async (slug: string | null) => {
    "use server";
    await setEventInboxSlug(id, slug);
  };

  const deleteEventAction = async () => {
    "use server";
    await deleteEvent(id);
  };

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

      <div className="max-w-2xl space-y-8">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            Event Details
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Name, dates, timezone, venues, and series.
          </p>
          <EventForm
            venues={venues}
            series={series}
            event={{ ...event, venueIds: event.venues.map((v) => v.venueId) }}
            action={updateEventAction}
            cancelHref={`/events/${id}`}
          />
        </div>

        <StatusDefaultsPanel
          defaults={statusDefaults}
          substatuses={substatuses}
          saveAll={saveAllAction}
          clearDefault={clearDefaultAction}
        />

        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Areas</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Regions and areas this event draws hotels from.</p>
          <EventAreasPanel
            value={{ regions: event.regions, areas: event.areas }}
            regions={regionOptions.map((o) => o.label)}
            areas={areaOptions.map((o) => ({ label: o.label, region: o.group }))}
            save={saveAreasAction}
          />
        </div>

        <div id="inbox" className="scroll-mt-24">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Inbox</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Mail sent to this address lands in the event&apos;s Inbox.</p>
          <InboxAddressPanel {...inbox} save={saveInboxAction} />
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h2 className="text-lg font-medium text-red-700 dark:text-red-400 mb-1">
            Danger Zone
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Permanently delete this event and everything associated with it.
          </p>
          <DeleteButton resource="EVENTS" action={deleteEventAction} label="Delete Event" />
        </div>
      </div>
    </>
  );
}
