import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasGlobalView, loadPermissionsForUser } from "@/lib/permissions";
import { validateAuthorizationRequest } from "@/lib/mcpOAuth";
import { ConsentActions } from "./ConsentActions";
import { approveAuthorization, denyAuthorization } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Authorize connector" };

// OAuth approval screen. /api/oauth/authorize validates the request and sends
// the browser here (via /login when there's no session), so by the time this
// renders the caller is a signed-in user looking at a request that already
// passed client + PKCE validation. It re-validates anyway — the query string is
// client-supplied — and the Server Actions validate a third time before minting.

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-10">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}

export default async function AuthorizeConnectorPage({ searchParams }: Props) {
  const session = await requireAuth();
  const resolved = await searchParams;

  const params = new URLSearchParams();
  for (const key of [
    "client_id",
    "redirect_uri",
    "code_challenge",
    "code_challenge_method",
    "state",
    "scope",
    "response_type",
  ]) {
    params.set(key, first(resolved[key]));
  }

  const result = await validateAuthorizationRequest(params);
  if (!result.ok) {
    // Deliberately does NOT bounce to the client's redirect_uri: someone landing
    // here with a broken link deserves to see why, and the API route already
    // handles the machine-readable error path.
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          Authorization request rejected
        </h1>
        <p className="mt-1 text-sm font-mono text-red-600 dark:text-red-400">
          {result.error}
        </p>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          {result.errorDescription}
        </p>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Start again from the connector setup screen in Claude.
        </p>
      </Shell>
    );
  }

  const request = result.request;

  const [user, perms, assignments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true, roleRef: { select: { name: true } } },
    }),
    loadPermissionsForUser(session.user.id),
    prisma.eventStaff.findMany({
      where: { userId: session.user.id },
      select: { event: { select: { id: true, name: true } } },
      orderBy: { event: { name: "asc" } },
    }),
  ]);

  // Tokens carry no scope of their own — every MCP tool call re-resolves the
  // user's permissions at call time (requirePermissionForUser). So "what the
  // connector gets" is exactly "what this user can already do", and that's what
  // this screen describes rather than a scope list.
  const seesAllEvents = hasGlobalView(
    perms.permissions,
    PermissionResource.EVENTS,
  );
  const eventNames = assignments.map((a) => a.event.name);

  let redirectHost = request.redirectUri;
  try {
    redirectHost = new URL(request.redirectUri).host;
  } catch {
    // validateAuthorizationRequest already parsed it as a registered URI.
  }

  return (
    <Shell>
      <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
        Event Manager
      </p>
      <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
        Connect {request.clientName || "this application"}?
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {request.clientName || "An application"} is asking to use the Event
        Manager MCP connector as{" "}
        <strong className="text-gray-900 dark:text-gray-100">
          {user?.name || user?.email || session.user.email}
        </strong>
        .
      </p>

      <div className="mt-5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
          What it will be able to do
        </p>
        <ul className="mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>
            Everything your{" "}
            <strong className="text-gray-900 dark:text-gray-100">
              {user?.roleRef?.name || "assigned"}
            </strong>{" "}
            role allows — read and write alike. It gets no more access than you
            have, and no less.
          </li>
          <li>
            {seesAllEvents ? (
              <>Work with data on all events.</>
            ) : eventNames.length > 0 ? (
              <>
                Work with data on the events you&apos;re assigned to:{" "}
                <span className="text-gray-900 dark:text-gray-100">
                  {eventNames.join(", ")}
                </span>
                .
              </>
            ) : (
              <>
                Nothing event-specific — you aren&apos;t assigned to any events
                yet.
              </>
            )}
          </li>
          <li>
            Stay connected without your password. You can disconnect it from the
            application at any time.
          </li>
        </ul>
      </div>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 break-all">
        After you allow, you&apos;ll be returned to{" "}
        <span className="font-mono text-gray-700 dark:text-gray-300">
          {redirectHost}
        </span>
        .
      </p>

      <div className="mt-6">
        <ConsentActions
          approveAction={approveAuthorization}
          denyAction={denyAuthorization}
          clientId={request.clientId}
          redirectUri={request.redirectUri}
          codeChallenge={request.codeChallenge}
          codeChallengeMethod={request.codeChallengeMethod}
          state={request.state}
          scope={request.scope}
        />
      </div>
    </Shell>
  );
}
