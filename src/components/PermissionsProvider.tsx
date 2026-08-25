"use client";

import { createContext, useContext, useMemo } from "react";
import type { PermissionLevel, PermissionResource } from "@prisma/client";
import { canDo, type PermissionMap } from "@/lib/eventPermissions";

// The one piece of cross-component client state in the app, and it is a
// read-only snapshot rather than mutable state: a layout resolves the levels on
// the server and every panel below it needs the same answer. The alternative
// was threading a canWrite prop through 60-odd pages to reach a nested
// equipment table, which drifts the moment someone adds a panel.
type PermissionsValue = {
  can: (resource: PermissionResource, action: Exclude<PermissionLevel, "NONE">) => boolean;
};

const PermissionsContext = createContext<PermissionsValue | null>(null);

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: PermissionMap;
  children: React.ReactNode;
}) {
  const value = useMemo<PermissionsValue>(
    () => ({ can: (resource, action) => canDo(permissions, resource, action) }),
    [permissions],
  );
  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

// Returns true when no provider is above it. That is deliberate: these hooks
// live inside components shared with pages that gate themselves by other means,
// and a missing provider must not silently turn a working page read-only. The
// server still enforces every mutation regardless.
export function useCanDo(
  resource: PermissionResource,
  action: Exclude<PermissionLevel, "NONE">,
): boolean {
  const ctx = useContext(PermissionsContext);
  return ctx ? ctx.can(resource, action) : true;
}

export function useCanWrite(resource: PermissionResource): boolean {
  return useCanDo(resource, "WRITE");
}

export function useCanDelete(resource: PermissionResource): boolean {
  return useCanDo(resource, "DELETE");
}
