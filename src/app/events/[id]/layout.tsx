import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { EventLayoutClient } from "@/components/EventLayoutClient";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return {};
  return {
    title: {
      default: `${event.name} · Event Manager`,
      template: `%s · ${event.name} · Event Manager`,
    },
  };
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Gate at the layout so unassigned/no-permission users redirect before sidebar+header render.
  const [event] = await Promise.all([
    getEvent(id),
    requirePermission("EVENTS", "VIEW", id),
  ]);
  if (!event) notFound();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <EventLayoutClient eventId={id} eventName={event.name} header={<Header />}>
        {children}
      </EventLayoutClient>
    </div>
  );
}
