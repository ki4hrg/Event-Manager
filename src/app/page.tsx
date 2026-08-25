import Link from "next/link";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasGlobalView, hasPermission, loadPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { EmptyState } from "@/components/EmptyState";
import { getUserLandingPage, getLastEventId } from "@/lib/userSettings";

export const dynamic = "force-dynamic";

// This page must never redirect to itself. requirePermission() answers a denial
// with redirect("/"), and so do the users layout and the events list — so "/"
// is where every unauthorized user lands. Calling requirePermission("EVENTS",
// "VIEW") here (GLOBAL scope, no eventId) would bounce a role with
// EVENTS:GLOBAL:NONE straight back to "/" and loop forever at login. That is
// the intuitive setting for "don't show them every event", so it is a
// configuration an admin will reach for. Gate by reading permissions instead,
// and render what the user can actually get to.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { permissions } = await loadPermissions(session.user.id);
  const canViewEvents = hasGlobalView(permissions, PermissionResource.EVENTS);
  const canViewVenues = hasGlobalView(permissions, PermissionResource.VENUES);
  const canViewContacts = hasGlobalView(permissions, PermissionResource.CONTACTS);

  if (canViewEvents) {
    const [pref, lastId] = await Promise.all([
      getUserLandingPage(session.user.id),
      getLastEventId(session.user.id),
    ]);

    if (pref === "events") {
      redirect("/events");
    }

    if (pref === "last_event") {
      // Existence isn't enough: access can be revoked after the preference is
      // stored, and sending someone to a 404 on every login is the kind of
      // thing that reads as the app being broken. hasPermission reuses the
      // request-cached permission load, so this costs one existence query.
      if (lastId) {
        const [exists, allowed] = await Promise.all([
          prisma.event.findUnique({ where: { id: lastId }, select: { id: true } }),
          hasPermission("EVENTS", "VIEW", lastId),
        ]);
        if (exists && allowed) redirect(`/events/${lastId}`);
      }
      redirect("/events");
    }
  }

  const cards = [
    canViewEvents && {
      title: "Events",
      description: "Manage conferences and events",
      href: "/events",
    },
    canViewVenues && {
      title: "Venues",
      description: "Manage venues and rooms",
      href: "/venues",
    },
    canViewContacts && {
      title: "Contacts",
      description: "Manage speakers, vendors, and other contacts",
      href: "/contacts",
    },
  ].filter(Boolean) as { title: string; description: string; href: string }[];

  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        Dashboard
      </h1>

      {cards.length === 0 ? (
        <EmptyState message="You don't have access to anything yet. Ask an administrator to assign you a role and the events you'll be working on." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <DashboardCard key={card.href} {...card} />
          ))}
        </div>
      )}
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
