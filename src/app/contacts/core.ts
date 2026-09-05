// Pure cores for contact mutations. NOT a "use server" file — these functions
// must not be exposed as Server Actions, because they accept `userId` as an
// argument and trust it for the permission check. A "use server" export with
// a client-supplied userId would let any authenticated user impersonate any
// other user. Callers (the Server Action wrappers in ./actions.ts and the
// MCP tools in @/lib/mcpTools/contacts) resolve userId from a trusted source
// (cookie session / bearer token) and pass it through.
//
// `tenantId` is trusted the same way: the wrapper resolves it from the session
// (the active tenant) or the MCP `tenant` argument, and the permission check
// confirms the user actually holds a role there.

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";

export type ContactWriteArgs = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  notes: string | null;
  roles: string[];
};

export async function createContactCore(args: ContactWriteArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.CONTACTS, "WRITE", { tenantId });
  return prisma.contact.create({
    data: {
      tenantId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      organization: args.organization,
      notes: args.notes,
      roles: args.roles,
      updatedById: userId,
    },
  });
}

export async function updateContactCore(
  id: string,
  args: ContactWriteArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.CONTACTS, "WRITE", { tenantId });
  // `tenantId` in the unique where makes a foreign id a not-found rather than
  // a cross-tenant write.
  return prisma.contact.update({
    where: { id, tenantId },
    data: {
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      organization: args.organization,
      notes: args.notes,
      roles: args.roles,
      updatedById: userId,
    },
  });
}

export async function deleteContactCore(id: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.CONTACTS, "DELETE", { tenantId });
  await prisma.contact.delete({ where: { id, tenantId } });
}
