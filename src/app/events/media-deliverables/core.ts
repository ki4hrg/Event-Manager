// Pure cores for media deliverables. NOT a "use server" file — see
// src/app/contacts/core.ts for the security rationale.

import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { assertEventRefs } from "@/lib/eventRefs";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";

export type CreateMediaDeliverableArgs = {
  name: string;
  mediaType: string | null;
  description: string | null;
  delivery: string | null;
  notes: string | null;
  providerVendorId: string | null;
  providerContactId: string | null;
  functionIds: string[];
  presentationIds: string[];
  contacts?: { contactId: string; role: string | null }[];
};

export async function createMediaDeliverableCore(eventId: string, args: CreateMediaDeliverableArgs, userId: string) {
  await requirePermissionForUser(userId, "MEDIA_DELIVERABLES", "WRITE", eventId);
  await assertEventRefs(eventId, { vendorIds: [args.providerVendorId], contactIds: [args.providerContactId] });
  if (!args.name.trim()) throw new Error("Name is required");

  // Links must stay inside the event; contacts inside its tenant.
  const [functions, presentations] = await Promise.all([
    args.functionIds.length
      ? prisma.function.count({ where: { id: { in: args.functionIds }, eventId } })
      : Promise.resolve(0),
    args.presentationIds.length
      ? prisma.presentation.count({ where: { id: { in: args.presentationIds }, eventId } })
      : Promise.resolve(0),
  ]);
  if (functions !== new Set(args.functionIds).size || presentations !== new Set(args.presentationIds).size) {
    throw new PermissionError("NOT_FOUND", "Linked record not found");
  }
  const contacts = args.contacts ?? [];
  if (contacts.length) {
    const tenantId = await requireEventTenantId(eventId);
    const found = await prisma.contact.count({ where: { id: { in: contacts.map((c) => c.contactId) }, tenantId } });
    if (found !== new Set(contacts.map((c) => c.contactId)).size) throw new PermissionError("NOT_FOUND", "Contact not found");
  }

  const defaults = await resolveCreateStatus(eventId, "MEDIA_DELIVERABLE");
  const deliverable = await prisma.mediaDeliverable.create({
    data: {
      name: args.name,
      eventId,
      mediaType: args.mediaType,
      description: args.description,
      delivery: args.delivery,
      notes: args.notes,
      providerVendorId: args.providerVendorId,
      providerContactId: args.providerContactId,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: userId,
    },
  });

  const [, , , applied] = await Promise.all([
    args.functionIds.length
      ? prisma.mediaDeliverableFunction.createMany({
          data: args.functionIds.map((functionId) => ({ mediaDeliverableId: deliverable.id, functionId })),
        })
      : Promise.resolve(null),
    args.presentationIds.length
      ? prisma.mediaDeliverablePresentation.createMany({
          data: args.presentationIds.map((presentationId) => ({ mediaDeliverableId: deliverable.id, presentationId })),
        })
      : Promise.resolve(null),
    contacts.length
      ? prisma.mediaDeliverableContact.createMany({
          data: contacts.map((c) => ({ mediaDeliverableId: deliverable.id, contactId: c.contactId, role: c.role })),
          skipDuplicates: true,
        })
      : Promise.resolve(null),
    autoAssignDefaultWorkflowsCore("media_deliverable", deliverable.id, eventId),
  ]);
  return { ...deliverable, ...applied };
}
