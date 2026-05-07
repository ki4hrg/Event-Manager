"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";

export async function getAVOrders(eventId: string) {
  return prisma.aVOrder.findMany({
    where: { eventId },
    include: {
      functions: true,
      presentation: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getAVOrder(id: string) {
  return prisma.aVOrder.findUnique({
    where: { id },
    include: {
      functions: { include: { schedules: { orderBy: { startTime: "asc" } } } },
      presentation: true,
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
}

export async function createAVOrder(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const notes = formData.get("notes") as string;
  const presentationId = formData.get("presentationId") as string;
  const functionId = formData.get("functionId") as string;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const avOrder = await prisma.aVOrder.create({
    data: {
      name,
      eventId,
      notes: notes || null,
      presentationId: presentationId || null,
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

  // Link to function if provided (FK is on Function)
  if (functionId) {
    await prisma.function.update({
      where: { id: functionId },
      data: { avOrderId: avOrder.id },
    });
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
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
// Function linking (FK is on Function.avOrderId)
// ============================================================================

export async function linkAVOrderToFunction(avOrderId: string, functionId: string, eventId: string) {
  await prisma.function.update({
    where: { id: functionId },
    data: { avOrderId },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkAVOrderFromFunction(avOrderId: string, functionId: string, eventId: string) {
  await prisma.function.update({
    where: { id: functionId },
    data: { avOrderId: null },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkAVOrderToPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { presentationId },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkAVOrderFromPresentation(avOrderId: string, eventId: string) {
  const avOrder = await prisma.aVOrder.findUnique({
    where: { id: avOrderId },
    select: { presentationId: true },
  });
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { presentationId: null },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  if (avOrder?.presentationId) {
    revalidatePath(`/events/${eventId}/presentations/${avOrder.presentationId}`);
  }
}

// AVOrders with no linked functions (for a given event)
export async function getAvailableAVOrdersForFunction(eventId: string) {
  return prisma.aVOrder.findMany({
    where: { eventId, functions: { none: {} } },
    orderBy: { name: "asc" },
  });
}

// AVOrders not yet linked to a presentation (for a given event)
export async function getAvailableAVOrdersForPresentation(eventId: string) {
  return prisma.aVOrder.findMany({
    where: { eventId, presentationId: null },
    orderBy: { name: "asc" },
  });
}

// Link/unlink actions for the Function detail page panel
export async function linkAVOrderToFunctionFromFunction(
  avOrderId: string,
  functionId: string,
  eventId: string
) {
  await prisma.function.update({
    where: { id: functionId },
    data: { avOrderId },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkAVOrderFromFunctionPage(functionId: string, eventId: string) {
  await prisma.function.update({
    where: { id: functionId },
    data: { avOrderId: null },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// Link/unlink actions for the Presentation detail page panel
export async function linkAVOrderToPresentationFromPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { presentationId },
  });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkAVOrderFromPresentationPage(presentationId: string, eventId: string) {
  await prisma.aVOrder.updateMany({
    where: { presentationId },
    data: { presentationId: null },
  });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
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
