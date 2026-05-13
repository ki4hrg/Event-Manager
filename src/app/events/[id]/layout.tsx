import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { EventLayoutClient } from "@/components/EventLayoutClient";
import { getEvent } from "../actions";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
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
