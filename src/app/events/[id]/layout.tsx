import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { EventLayoutClient } from "@/components/EventLayoutClient";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "../actions";

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
      <div className="print:hidden">
        <Header />
      </div>
      <EventLayoutClient eventId={id} eventName={event.name}>
        {children}
      </EventLayoutClient>
    </div>
  );
}
