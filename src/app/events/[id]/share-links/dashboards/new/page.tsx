import { redirect } from "next/navigation";
import { createShareLinkGroup } from "@/app/events/share-link-groups/actions";

export const dynamic = "force-dynamic";

export default async function NewDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const group = await createShareLinkGroup({ eventId, label: null });
  redirect(`/events/${eventId}/share-links/dashboards/${group.id}`);
}
