// Pure cores for contact mutations. NOT a "use server" file — these functions
// must not be exposed as Server Actions, because they accept `userId` as an
// argument and trust it for the permission check. A "use server" export with
// a client-supplied userId would let any authenticated user impersonate any
// other user. Callers (the Server Action wrappers in ./actions.ts and the
// MCP tools in @/lib/mcpTools/contacts) resolve userId from a trusted source
// (cookie session / bearer token) and pass it through.

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

export async function createContactCore(args: ContactWriteArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.CONTACTS, "WRITE");
  return prisma.contact.create({
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

export async function updateContactCore(
  id: string,
  args: ContactWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.CONTACTS, "WRITE");
  return prisma.contact.update({
    where: { id },
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

export async function deleteContactCore(id: string, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.CONTACTS, "DELETE");
  await prisma.contact.delete({ where: { id } });
}
