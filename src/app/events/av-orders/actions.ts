"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";

export async function getAVOrders(eventId: string) {
  const rows = await prisma.aVOrder.findMany({
    where: { eventId },
    include: {
      functionLinks: { include: { function: true } },
      presentationLinks: { include: { presentation: { select: { id: true, title: true } } } },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    functions: r.functionLinks.map((l) => l.function),
    presentations: r.presentationLinks.map((l) => l.presentation),
  }));
}

export async function getAVOrder(id: string) {
  const row = await prisma.aVOrder.findUnique({
    where: { id },
    include: {
      functionLinks: { include: { function: { include: { schedules: { orderBy: { startTime: "asc" } } } } } },
      presentationLinks: { include: { presentation: true } },
      audioSection: {
        include: {
          inputGroups: {
            include: {
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
              inputItems: {
                include: {
                  equipment: true,
                  providerVendor: true,
                  providerContact: true,
                  operatorVendor: true,
                  operatorContact: true,
                },
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
          monitorMixes: {
            include: {
              equipment: true,
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
              monitorOutputs: {
                include: {
                  equipment: true,
                  providerVendor: true,
                  providerContact: true,
                  operatorVendor: true,
                  operatorContact: true,
                },
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      videoSection: {
        include: {
          equipmentItems: {
            include: {
              equipment: true,
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
            },
            orderBy: [{ sortOrder: "asc" }, { item: "asc" }],
          },
        },
      },
      equipmentItems: {
        include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true },
        orderBy: [{ sortOrder: "asc" }, { item: "asc" }],
      },
    },
  });
  if (!row) return null;
  return {
    ...row,
    functions: row.functionLinks.map((l) => l.function),
    presentations: row.presentationLinks.map((l) => l.presentation),
  };
}

export async function createAVOrder(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const notes = formData.get("notes") as string;
  const presentationId = (formData.get("presentationId") as string) || null;
  const functionId = (formData.get("functionId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const avOrder = await prisma.aVOrder.create({
    data: {
      name,
      eventId,
      notes: notes || null,
    },
  });

  // Auto-create AudioSection (with a default InputGroup) and VideoSection
  const audioSection = await prisma.audioSection.create({
    data: { avOrderId: avOrder.id },
  });

  await Promise.all([
    prisma.inputGroup.create({ data: { audioSectionId: audioSection.id, name: "Default" } }),
    prisma.videoSection.create({ data: { avOrderId: avOrder.id } }),
  ]);

  if (functionId) {
    await prisma.aVOrderFunction.create({ data: { avOrderId: avOrder.id, functionId } });
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  }

  if (presentationId) {
    await prisma.aVOrderPresentation.create({ data: { avOrderId: avOrder.id, presentationId } });
    revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  }

  const vendorIdToAssign = selectedVendorId ?? (await getDefaultVendorForModel(eventId, "AV_ORDER"))?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.aVOrderVendor.create({ data: { avOrderId: avOrder.id, vendorId: vendorIdToAssign } });
  }

  await autoAssignDefaultWorkflows("av_order", avOrder.id);
  revalidatePath(`/events/${eventId}/av-orders`);
  redirect(`/events/${eventId}/av-orders/${avOrder.id}`);
}

export async function updateAVOrder(id: string, eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const notes = formData.get("notes") as string;

  await prisma.aVOrder.update({
    where: { id },
    data: {
      name,
      notes: notes || null,
    },
  });

  revalidatePath(`/events/${eventId}/av-orders`);
  revalidatePath(`/events/${eventId}/av-orders/${id}`);
  redirect(`/events/${eventId}/av-orders/${id}?success=AV Order updated`);
}

export async function deleteAVOrder(id: string, eventId: string) {
  await prisma.aVOrder.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders`);
  redirect(`/events/${eventId}/av-orders`);
}

// ============================================================================
// Function / Presentation linking (M:N via AVOrderFunction / AVOrderPresentation)
// ============================================================================

export async function linkAVOrderToFunction(avOrderId: string, functionId: string, eventId: string) {
  await prisma.aVOrderFunction.upsert({
    where: { avOrderId_functionId: { avOrderId, functionId } },
    create: { avOrderId, functionId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkAVOrderFromFunction(avOrderId: string, functionId: string, eventId: string) {
  await prisma.aVOrderFunction.deleteMany({ where: { avOrderId, functionId } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkAVOrderToPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  await prisma.aVOrderPresentation.upsert({
    where: { avOrderId_presentationId: { avOrderId, presentationId } },
    create: { avOrderId, presentationId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkAVOrderFromPresentation(avOrderId: string, presentationId: string, eventId: string) {
  await prisma.aVOrderPresentation.deleteMany({ where: { avOrderId, presentationId } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// AVOrders not yet linked to this function (for the function detail panel)
export async function getAvailableAVOrdersForFunction(eventId: string, functionId?: string) {
  return prisma.aVOrder.findMany({
    where: {
      eventId,
      ...(functionId ? { NOT: { functionLinks: { some: { functionId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

// AVOrders not yet linked to this presentation (for the presentation detail panel)
export async function getAvailableAVOrdersForPresentation(eventId: string, presentationId?: string) {
  return prisma.aVOrder.findMany({
    where: {
      eventId,
      ...(presentationId ? { NOT: { presentationLinks: { some: { presentationId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

// Aliases for callers from Function / Presentation detail pages
export async function linkAVOrderToFunctionFromFunction(
  avOrderId: string,
  functionId: string,
  eventId: string
) {
  return linkAVOrderToFunction(avOrderId, functionId, eventId);
}

export async function unlinkAVOrderFromFunctionPage(avOrderId: string, functionId: string, eventId: string) {
  return unlinkAVOrderFromFunction(avOrderId, functionId, eventId);
}

export async function linkAVOrderToPresentationFromPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  return linkAVOrderToPresentation(avOrderId, presentationId, eventId);
}

export async function unlinkAVOrderFromPresentationPage(avOrderId: string, presentationId: string, eventId: string) {
  return unlinkAVOrderFromPresentation(avOrderId, presentationId, eventId);
}

// ============================================================================
// AudioSection
// ============================================================================

export async function updateAudioSection(id: string, avOrderId: string, eventId: string, formData: FormData) {
  await prisma.audioSection.update({
    where: { id },
    data: { notes: (formData.get("notes") as string) || null },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// InputGroup CRUD
// ============================================================================

export async function createInputGroup(audioSectionId: string, avOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.inputGroup.aggregate({ where: { audioSectionId }, _max: { sortOrder: true } });
  await prisma.inputGroup.create({
    data: {
      audioSectionId,
      name: (formData.get("name") as string) || "Default",
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateInputGroup(id: string, avOrderId: string, eventId: string, formData: FormData) {
  await prisma.inputGroup.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteInputGroup(id: string, avOrderId: string, eventId: string) {
  await prisma.inputGroup.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// InputItem CRUD
// ============================================================================

export async function createInputItem(inputGroupId: string, avOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.inputItem.aggregate({ where: { inputGroupId }, _max: { sortOrder: true } });
  await prisma.inputItem.create({
    data: {
      inputGroupId,
      description: formData.get("description") as string,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : 1,
      equipmentId: (formData.get("equipmentId") as string) || null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateInputItem(id: string, avOrderId: string, eventId: string, formData: FormData) {
  await prisma.inputItem.update({
    where: { id },
    data: {
      description: formData.get("description") as string,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : 1,
      equipmentId: (formData.get("equipmentId") as string) || null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteInputItem(id: string, avOrderId: string, eventId: string) {
  await prisma.inputItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// MonitorMix CRUD
// ============================================================================

export async function createMonitorMix(audioSectionId: string, avOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.monitorMix.aggregate({ where: { audioSectionId }, _max: { sortOrder: true } });
  await prisma.monitorMix.create({
    data: {
      audioSectionId,
      description: formData.get("description") as string,
      equipmentId: (formData.get("equipmentId") as string) || null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateMonitorMix(id: string, avOrderId: string, eventId: string, formData: FormData) {
  await prisma.monitorMix.update({
    where: { id },
    data: {
      description: formData.get("description") as string,
      equipmentId: (formData.get("equipmentId") as string) || null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteMonitorMix(id: string, avOrderId: string, eventId: string) {
  await prisma.monitorMix.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function createMonitorOutput(monitorMixId: string, avOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.monitorOutput.aggregate({ where: { monitorMixId }, _max: { sortOrder: true } });
  await prisma.monitorOutput.create({
    data: {
      monitorMixId,
      equipmentId: (formData.get("equipmentId") as string) || null,
      quantity: parseInt(formData.get("quantity") as string) || 1,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateMonitorOutput(id: string, avOrderId: string, eventId: string, formData: FormData) {
  await prisma.monitorOutput.update({
    where: { id },
    data: {
      equipmentId: (formData.get("equipmentId") as string) || null,
      quantity: parseInt(formData.get("quantity") as string) || 1,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteMonitorOutput(id: string, avOrderId: string, eventId: string) {
  await prisma.monitorOutput.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// VideoSection
// ============================================================================

export async function updateVideoSection(id: string, avOrderId: string, eventId: string, formData: FormData) {
  await prisma.videoSection.update({
    where: { id },
    data: { notes: (formData.get("notes") as string) || null },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function createVideoEquipmentItem(videoSectionId: string, avOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.equipmentItem.aggregate({ where: { videoSectionId }, _max: { sortOrder: true } });
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");
  await prisma.equipmentItem.create({
    data: {
      videoSectionId,
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateVideoEquipmentItem(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");
  await prisma.equipmentItem.update({
    where: { id },
    data: {
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteVideoEquipmentItem(id: string, avOrderId: string, eventId: string) {
  await prisma.equipmentItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// AV Order-level EquipmentItem CRUD
// ============================================================================

export async function createAVEquipmentItem(avOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.equipmentItem.aggregate({ where: { avOrderId }, _max: { sortOrder: true } });
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");
  await prisma.equipmentItem.create({
    data: {
      avOrderId,
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateAVEquipmentItem(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");
  await prisma.equipmentItem.update({
    where: { id },
    data: {
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteAVEquipmentItem(id: string, avOrderId: string, eventId: string) {
  await prisma.equipmentItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// Party options
// ============================================================================

export async function getAVOrderPartyOptions(avOrderId: string, eventId: string) {
  const [avOrderVendors, avOrder] = await Promise.all([
    prisma.aVOrderVendor.findMany({
      where: { avOrderId },
      select: { vendor: { select: { id: true, name: true } } },
      orderBy: { vendor: { name: "asc" } },
    }),
    prisma.aVOrder.findUnique({
      where: { id: avOrderId },
      select: {
        presentation: {
          select: {
            speakers: {
              include: { contact: true },
              orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            },
          },
        },
      },
    }),
  ]);

  const vendors = avOrderVendors.map((av) => av.vendor);

  const contacts =
    avOrder?.presentation?.speakers.map((s) => ({
      id: s.contact.id,
      firstName: s.contact.firstName,
      lastName: s.contact.lastName,
      organization: s.contact.organization,
    })) ?? [];

  return { vendors, contacts };
}

export async function getAVOrderResponsiblePartyOptions(avOrderId: string, eventId: string): Promise<{ responsiblePartyVendors: ResponsiblePartyOptions; contacts: { id: string; firstName: string; lastName: string; organization: string | null }[] }> {
  const [orderVendors, event, systemVendor, avOrder] = await Promise.all([
    prisma.aVOrderVendor.findMany({
      where: { avOrderId },
      select: { vendor: { select: { id: true, name: true } } },
      orderBy: { vendor: { name: "asc" } },
    }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { venue: { select: { vendor: { select: { id: true, name: true } } } } },
    }),
    prisma.vendor.findFirst({ where: { isSystemVendor: true }, select: { id: true, name: true } }),
    prisma.aVOrder.findUnique({
      where: { id: avOrderId },
      select: {
        presentation: {
          select: {
            speakers: {
              include: { contact: true },
              orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            },
          },
        },
      },
    }),
  ]);

  const venueVendor = event?.venue?.vendor ?? null;
  const excludeIds = new Set([
    ...(venueVendor ? [venueVendor.id] : []),
    ...(systemVendor ? [systemVendor.id] : []),
  ]);
  const vendors = orderVendors.map((av) => av.vendor).filter((v) => !excludeIds.has(v.id));

  const contacts = avOrder?.presentation?.speakers.map((s) => ({
    id: s.contact.id,
    firstName: s.contact.firstName,
    lastName: s.contact.lastName,
    organization: s.contact.organization,
  })) ?? [];

  return {
    responsiblePartyVendors: { vendors, venueVendor, systemVendor: systemVendor ?? null },
    contacts,
  };
}

export async function deleteAVOrders(ids: string[], eventId: string) {
  await prisma.aVOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/av-orders`);
}

export async function bulkUpdateAVOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
) {
  const { status, substatus, vendorId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.aVOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
      },
    });
  }

  if (vendorId) {
    await prisma.aVOrderVendor.deleteMany({ where: { avOrderId: { in: ids } } });
    await prisma.aVOrderVendor.createMany({ data: ids.map((id) => ({ avOrderId: id, vendorId })) });
  }

  revalidatePath(`/events/${eventId}/av-orders`);
}
