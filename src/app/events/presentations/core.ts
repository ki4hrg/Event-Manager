// Pure cores for presentation + track + speaker mutations. NOT a "use server"
// file — see src/app/contacts/core.ts for the security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError, requireEventTenantId } from "@/lib/permissions";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";

async function assertPresentationInEvent(presentationId: string, eventId: string) {
  const found = await prisma.presentation.findUnique({
    where: { id: presentationId, eventId },
    select: { id: true },
  });
  if (!found) throw new PermissionError("NOT_FOUND");
}

// ---------------------------------------------------------------------------
// PresentationTrack

export async function createTrackCore(
  eventId: string,
  args: { name: string; color: string | null },
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  const maxOrder = await prisma.presentationTrack.findFirst({
    where: { eventId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return prisma.presentationTrack.create({
    data: {
      name: args.name,
      color: args.color,
      eventId,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateTrackCore(
  trackId: string,
  eventId: string,
  args: { name: string; color: string | null },
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  return prisma.presentationTrack.update({
    where: { id: trackId, eventId },
    data: { name: args.name, color: args.color },
  });
}

export async function deleteTrackCore(trackId: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "DELETE", eventId);
  await prisma.presentationTrack.delete({ where: { id: trackId, eventId } });
}

// ---------------------------------------------------------------------------
// Presentation (top-level)

export type PresentationCreateArgs = {
  title: string;
  description: string | null;
  trackId: string | null;
  schedulingNotes: string | null;
  internalNotes: string | null;
  type: string;
  breakoutGroupId: string | null;
  instanceCount: number;
  advancerVendorId: string | null;
  advancerContactId: string | null;
  // Speakers added at create time.
  speakerContactIds: string[];
  speakerRoles: string[];
  primarySpeakerId: string | null;
};

export async function createPresentationCore(
  eventId: string,
  args: PresentationCreateArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  const defaults = await resolveCreateStatus(eventId, "PRESENTATION");

  const presentation = await prisma.presentation.create({
    data: {
      title: args.title,
      type: args.type || "",
      description: args.description,
      trackId: args.trackId,
      schedulingNotes: args.schedulingNotes,
      internalNotes: args.internalNotes,
      breakoutGroupId: args.breakoutGroupId,
      instanceCount: args.instanceCount,
      eventId,
      status: defaults.status,
      substatus: defaults.substatus,
      advancerVendorId: args.advancerVendorId,
      advancerContactId: args.advancerContactId,
      updatedById: userId,
    },
  });

  if (args.speakerContactIds.length > 0) {
    await prisma.presentationContact.createMany({
      data: args.speakerContactIds.map((contactId, index) => ({
        presentationId: presentation.id,
        contactId,
        role: args.speakerRoles[index] || null,
        isPrimary: contactId === args.primarySpeakerId,
        sortOrder: index,
      })),
    });
  }

  await autoAssignDefaultWorkflowsCore("presentation", presentation.id, presentation.eventId);
  return presentation;
}

export async function updatePresentationInstanceCountCore(
  id: string,
  eventId: string,
  count: number,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  return prisma.presentation.update({
    where: { id, eventId },
    data: { instanceCount: count, updatedById: userId },
  });
}

// Partial-update args: pass `undefined` to leave the column untouched.
// String fields use empty string -> null elsewhere; here `null` explicitly
// clears the column, `undefined` leaves it alone.
export type PresentationUpdateArgs = {
  title: string;
  description: string | null;
  trackId: string | null;
  schedulingNotes: string | null;
  internalNotes: string | null;
  type: string;
  breakoutGroupId?: string | null;
  instanceCount?: number;
  advancerVendorId?: string | null;
  advancerContactId?: string | null;
};

export async function updatePresentationCore(
  id: string,
  eventId: string,
  args: PresentationUpdateArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  return prisma.presentation.update({
    where: { id, eventId },
    data: {
      title: args.title,
      type: args.type || "",
      description: args.description,
      trackId: args.trackId,
      schedulingNotes: args.schedulingNotes,
      internalNotes: args.internalNotes,
      ...(args.breakoutGroupId !== undefined ? { breakoutGroupId: args.breakoutGroupId } : {}),
      ...(args.instanceCount !== undefined ? { instanceCount: args.instanceCount } : {}),
      ...(args.advancerVendorId !== undefined ? { advancerVendorId: args.advancerVendorId } : {}),
      ...(args.advancerContactId !== undefined ? { advancerContactId: args.advancerContactId } : {}),
      updatedById: userId,
    },
  });
}

export async function deletePresentationCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "DELETE", eventId);
  await prisma.presentation.delete({ where: { id, eventId } });
}

export async function deletePresentationsCore(ids: string[], eventId: string, userId: string) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "DELETE", eventId);
  const r = await prisma.presentation.deleteMany({ where: { id: { in: ids }, eventId } });
  return { count: r.count };
}

export type BulkPresentationUpdates = {
  status?: EntityStatus;
  substatus?: string | null;
  trackId?: string | null;
  type?: string;
};

export async function bulkUpdatePresentationsCore(
  ids: string[],
  eventId: string,
  updates: BulkPresentationUpdates,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  const { status, substatus, trackId, type } = updates;
  const r = await prisma.presentation.updateMany({
    where: { id: { in: ids }, eventId },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(substatus !== undefined ? { substatus } : {}),
      ...(trackId !== undefined ? { trackId } : {}),
      ...(type !== undefined ? { type } : {}),
      updatedById: userId,
    },
  });
  return { count: r.count };
}

export async function duplicatePresentationCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  const original = await prisma.presentation.findUnique({
    where: { id, eventId },
    include: { speakers: true },
  });
  if (!original) throw new PermissionError("NOT_FOUND");

  const duplicate = await prisma.presentation.create({
    data: {
      title: `${original.title} (Copy)`,
      type: original.type,
      description: original.description,
      trackId: original.trackId,
      schedulingNotes: original.schedulingNotes,
      internalNotes: original.internalNotes,
      eventId: original.eventId,
      updatedById: userId,
    },
  });

  if (original.speakers.length > 0) {
    await prisma.presentationContact.createMany({
      data: original.speakers.map((s) => ({
        presentationId: duplicate.id,
        contactId: s.contactId,
        role: s.role,
        isPrimary: s.isPrimary,
        sortOrder: s.sortOrder,
      })),
    });
  }
  return duplicate;
}

// ---------------------------------------------------------------------------
// Speaker (PresentationContact)

export async function addSpeakerCore(
  presentationId: string,
  eventId: string,
  contactId: string,
  role: string | null,
  isPrimary: boolean,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  await assertPresentationInEvent(presentationId, eventId);

  const maxOrder = await prisma.presentationContact.findFirst({
    where: { presentationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  if (isPrimary) {
    await prisma.presentationContact.updateMany({
      where: { presentationId },
      data: { isPrimary: false },
    });
  }

  const row = await prisma.presentationContact.create({
    data: {
      presentationId,
      contactId,
      role,
      isPrimary,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: userId } });
  return row;
}

export async function updateSpeakerCore(
  speakerId: string,
  presentationId: string,
  eventId: string,
  role: string | null,
  isPrimary: boolean,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  await assertPresentationInEvent(presentationId, eventId);

  if (isPrimary) {
    await prisma.presentationContact.updateMany({
      where: { presentationId, id: { not: speakerId } },
      data: { isPrimary: false },
    });
  }

  const row = await prisma.presentationContact.update({
    where: { id: speakerId, presentation: { eventId } },
    data: { role, isPrimary },
  });
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: userId } });
  return row;
}

export async function removeSpeakerCore(
  speakerId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  await prisma.presentationContact.delete({
    where: { id: speakerId, presentation: { eventId } },
  });
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: userId } });
}

export type CreateAndAddSpeakerArgs = {
  presentationId: string;
  eventId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  organization: string | null;
  role: string | null;
  isPrimary: boolean;
};

export async function createAndAddPresentationSpeakerCore(
  args: CreateAndAddSpeakerArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", args.eventId);
  await assertPresentationInEvent(args.presentationId, args.eventId);

  const contact = await prisma.contact.create({
    data: {
      tenantId: await requireEventTenantId(args.eventId),
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      organization: args.organization,
      updatedById: userId,
    },
  });

  const maxOrder = await prisma.presentationContact.findFirst({
    where: { presentationId: args.presentationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  if (args.isPrimary) {
    await prisma.presentationContact.updateMany({
      where: { presentationId: args.presentationId },
      data: { isPrimary: false },
    });
  }

  const row = await prisma.presentationContact.create({
    data: {
      presentationId: args.presentationId,
      contactId: contact.id,
      role: args.role,
      isPrimary: args.isPrimary,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
  await prisma.presentation.update({
    where: { id: args.presentationId },
    data: { updatedById: userId },
  });
  return row;
}

export async function reorderSpeakersCore(
  presentationId: string,
  eventId: string,
  orderedIds: string[],
  userId: string,
) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.presentationContact.update({
        where: { id, presentation: { eventId } },
        data: { sortOrder: index },
      }),
    ),
  );
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: userId } });
}
