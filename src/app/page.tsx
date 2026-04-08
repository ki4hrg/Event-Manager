import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { getUserLandingPage, getLastEventId } from "@/lib/userSettings";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAuth();

  const [pref, lastId] = await Promise.all([
    getUserLandingPage(session.user.id),
    getLastEventId(session.user.id),
  ]);

  if (pref === "events") {
    redirect("/events");
  }

  if (pref === "last_event") {
    if (lastId) {
      const exists = await prisma.event.findUnique({ where: { id: lastId }, select: { id: true } });
      if (exists) redirect(`/events/${lastId}`);
    }
    redirect("/events");
  }

  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard
          title="Events"
          description="Manage conferences and events"
          href="/events"
        />
        <DashboardCard
          title="Venues"
          description="Manage venues and rooms"
          href="/venues"
        />
        <DashboardCard
          title="Contacts"
          description="Manage speakers, vendors, and other contacts"
          href="/contacts"
        />
        <DashboardCard
          title="Schedule"
          description="View event schedules"
          href="/schedule"
        />
      </div>
    </PageWrapper>
  );
}

function DashboardCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700"
    >
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </Link>
  );
}
