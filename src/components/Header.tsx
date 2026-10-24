import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { PermissionResource } from "@prisma/client";
import { hasGlobalView, loadPermissionsForUser, type PermissionGrant } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";
import { adminHomeHref, inventoryNavGroups } from "@/lib/adminNav";
import { prisma } from "@/lib/prisma";
import { getInboundEmailDomain } from "@/lib/email";
import { orgInboxWhere } from "@/app/events/inbox/core";
import { OPEN_STATUSES } from "@/app/events/inbox/views";
import { TenantSwitcher } from "./TenantSwitcher";
import { MobileNav, type HeaderLink } from "./MobileNav";

export async function Header() {
  const session = await auth();
  const ctx = await getTenantContext();
  // No active tenant (an account with no memberships yet) renders a bare
  // header: nothing to navigate to, but account and sign-out still work.
  const permissions: PermissionGrant[] =
    ctx?.active ? (await loadPermissionsForUser(ctx.userId, ctx.active.id)).permissions : [];
  const isSuperAdmin = ctx?.isSuperAdmin ?? false;

  // Main-nav links are gated on the page's own resource.
  // An ungated link is worse than a missing one: clicking it bounces the user
  // to "/" with no explanation, which reads as the app being broken.
  const canViewEvents = hasGlobalView(permissions, PermissionResource.EVENTS);
  const canViewVenues = hasGlobalView(permissions, PermissionResource.VENUES);
  const canViewContacts = hasGlobalView(permissions, PermissionResource.CONTACTS);
  const canViewVendors = hasGlobalView(permissions, PermissionResource.VENDORS);
  const canViewHotels = hasGlobalView(permissions, PermissionResource.HOTELS);
  const canView = (resource: PermissionResource) => hasGlobalView(permissions, resource);
  // Main nav rather than Admin: the default User role carries
  // STORAGE_LOCATIONS WRITE for load-out, so this isn't an admin surface.
  // Inventory opens on the first page of its nav the user can see.
  const inventoryHref = inventoryNavGroups({ canView })[0]?.links[0]?.href ?? null;
  // The admin area's own nav lists its pages; the header carries the entry.
  const adminHref = adminHomeHref({ canView, isSuperAdmin });
  // Open mail across the org's event inboxes and Unrouted: waiting to be read,
  // reviewed or released. The link shows while inbound mail is set up, or
  // while anything is still open. Gated like /inbox (EVENTS VIEW); the count
  // only covers events the user can see (orgInboxWhere → eventScopeWhere).
  const inboxOpen =
    canViewEvents && ctx?.active
      ? await prisma.inboundEmail.count({
          where: { ...(await orgInboxWhere(ctx.userId, ctx.active.id)), status: { in: OPEN_STATUSES } },
        })
      : 0;
  const showInbox = canViewEvents && (inboxOpen > 0 || getInboundEmailDomain() != null);

  const mainLinks: HeaderLink[] = [
    canViewEvents && { href: "/events", label: "Events" },
    canViewVenues && { href: "/venues", label: "Venues" },
    canViewContacts && { href: "/contacts", label: "Contacts" },
    canViewVendors && { href: "/vendors", label: "Vendors" },
    canViewHotels && { href: "/hotels", label: "Hotels" },
    inventoryHref && { href: inventoryHref, label: "Inventory" },
    showInbox && { href: "/inbox", label: inboxOpen > 0 ? `Inbox (${inboxOpen})` : "Inbox" },
    adminHref && { href: adminHref, label: "Admin" },
  ].filter((l): l is HeaderLink => !!l);

  const signOutAction = async () => {
    "use server";
    await signOut();
  };

  const navLinkClass =
    "whitespace-nowrap text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white";

  // The inline nav needs ~1000px once the org name and email are in the row,
  // so it only shows at `lg`; below that (every phone, portrait or landscape)
  // MobileNav collapses it all behind a menu button.
  return (
    <header className="relative bg-white dark:bg-gray-800 shadow">
      <div className="px-4 sm:px-6 lg:px-8 py-3 lg:py-4 flex justify-between items-center gap-4">
        <div className="flex items-center gap-6 xl:gap-8 min-w-0">
          <Link
            href="/"
            className="text-xl font-bold whitespace-nowrap text-gray-900 dark:text-white"
          >
            Event Manager
          </Link>
          <nav className="hidden lg:flex items-center gap-4 xl:gap-6">
            {mainLinks.map((l) => (
              <Link key={l.href} href={l.href} className={navLinkClass}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden lg:flex items-center gap-4 min-w-0">
          {ctx && ctx.tenants.length > 1 && ctx.active ? (
            <TenantSwitcher tenants={ctx.tenants} activeId={ctx.active.id} />
          ) : ctx?.active ? (
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[12rem]">
              {ctx.active.name}
            </span>
          ) : null}
          <Link
            href="/account"
            title={session?.user?.email ?? undefined}
            className="text-sm truncate max-w-[14rem] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            {session?.user?.email}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm whitespace-nowrap text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
        <MobileNav
          mainLinks={mainLinks}
          tenants={ctx?.tenants ?? []}
          activeTenant={ctx?.active ?? null}
          email={session?.user?.email ?? null}
          signOutAction={signOutAction}
        />
      </div>
    </header>
  );
}
