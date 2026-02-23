"use server";

import { prisma } from "@/lib/prisma";
import { FunctionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getFunctions(eventId: string) {
  return prisma.function.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}

export async function getFunction(id: string) {
  return prisma.function.findUnique({
    where: { id },
    include: {
      rooms: { include: { room: true } },
      avNeeds: true,
      beoDetails: true,
    },
  });
}

export async function createFunction(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as FunctionType;
  const date = formData.get("date") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const setupNotes = formData.get("setupNotes") as string;
  const roomIds = formData.getAll("roomIds") as string[];

  // Create the function
  const fn = await prisma.function.create({
    data: {
      name,
      description: description || null,
      type,
      date: new Date(date),
      startTime: new Date(`1970-01-01T${startTime}`),
      endTime: new Date(`1970-01-01T${endTime}`),
      setupNotes: setupNotes || null,
      eventId,
      rooms: {
        create: roomIds.map((roomId) => ({ roomId })),
      },
    },
  });

  // Handle AV needs
  const avFields = ["projector", "screen", "microphone", "podium", "webcast", "recording", "videoPlayback"];
  const hasAv = avFields.some((field) => formData.get(`av_${field}`) === "on");
  const avNotes = formData.get("av_notes") as string;

  if (hasAv || avNotes) {
    await prisma.aVNeeds.create({
      data: {
        functionId: fn.id,
        projector: formData.get("av_projector") === "on",
        screen: formData.get("av_screen") === "on",
        microphone: formData.get("av_microphone") === "on",
        podium: formData.get("av_podium") === "on",
        webcast: formData.get("av_webcast") === "on",
        recording: formData.get("av_recording") === "on",
        videoPlayback: formData.get("av_videoPlayback") === "on",
        notes: avNotes || null,
      },
    });
  }

  // Handle BEO details for meal type
  if (type === "MEAL") {
    const guaranteeCount = formData.get("beo_guaranteeCount") as string;
    const tableSetup = formData.get("beo_tableSetup") as string;
    const menuNotes = formData.get("beo_menuNotes") as string;
    const dietaryNotes = formData.get("beo_dietaryNotes") as string;
    const beverageNotes = formData.get("beo_beverageNotes") as string;
    const beoNotes = formData.get("beo_notes") as string;

    if (guaranteeCount || tableSetup || menuNotes || dietaryNotes || beverageNotes || beoNotes) {
      await prisma.bEODetails.create({
        data: {
          functionId: fn.id,
          guaranteeCount: guaranteeCount ? parseInt(guaranteeCount) : null,
          tableSetup: tableSetup || null,
          menuNotes: menuNotes || null,
          dietaryNotes: dietaryNotes || null,
          beverageNotes: beverageNotes || null,
          notes: beoNotes || null,
        },
      });
    }
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function updateFunction(id: string, eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as FunctionType;
  const date = formData.get("date") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const setupNotes = formData.get("setupNotes") as string;
  const roomIds = formData.getAll("roomIds") as string[];

  // Update the function
  await prisma.function.update({
    where: { id },
    data: {
      name,
      description: description || null,
      type,
      date: new Date(date),
      startTime: new Date(`1970-01-01T${startTime}`),
      endTime: new Date(`1970-01-01T${endTime}`),
      setupNotes: setupNotes || null,
    },
  });

  // Update room assignments - delete existing and recreate
  await prisma.functionRoom.deleteMany({ where: { functionId: id } });
  if (roomIds.length > 0) {
    await prisma.functionRoom.createMany({
      data: roomIds.map((roomId) => ({ functionId: id, roomId })),
    });
  }

  // Handle AV needs
  const avFields = ["projector", "screen", "microphone", "podium", "webcast", "recording", "videoPlayback"];
  const hasAv = avFields.some((field) => formData.get(`av_${field}`) === "on");
  const avNotes = formData.get("av_notes") as string;

  await prisma.aVNeeds.deleteMany({ where: { functionId: id } });
  if (hasAv || avNotes) {
    await prisma.aVNeeds.create({
      data: {
        functionId: id,
        projector: formData.get("av_projector") === "on",
        screen: formData.get("av_screen") === "on",
        microphone: formData.get("av_microphone") === "on",
        podium: formData.get("av_podium") === "on",
        webcast: formData.get("av_webcast") === "on",
        recording: formData.get("av_recording") === "on",
        videoPlayback: formData.get("av_videoPlayback") === "on",
        notes: avNotes || null,
      },
    });
  }

  // Handle BEO details for meal type
  await prisma.bEODetails.deleteMany({ where: { functionId: id } });
  if (type === "MEAL") {
    const guaranteeCount = formData.get("beo_guaranteeCount") as string;
    const tableSetup = formData.get("beo_tableSetup") as string;
    const menuNotes = formData.get("beo_menuNotes") as string;
    const dietaryNotes = formData.get("beo_dietaryNotes") as string;
    const beverageNotes = formData.get("beo_beverageNotes") as string;
    const beoNotes = formData.get("beo_notes") as string;

    if (guaranteeCount || tableSetup || menuNotes || dietaryNotes || beverageNotes || beoNotes) {
      await prisma.bEODetails.create({
        data: {
          functionId: id,
          guaranteeCount: guaranteeCount ? parseInt(guaranteeCount) : null,
          tableSetup: tableSetup || null,
          menuNotes: menuNotes || null,
          dietaryNotes: dietaryNotes || null,
          beverageNotes: beverageNotes || null,
          notes: beoNotes || null,
        },
      });
    }
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/functions/${id}`);
  redirect(`/events/${eventId}/functions/${id}?success=Function updated`);
}

export async function deleteFunction(id: string, eventId: string) {
  await prisma.function.delete({ where: { id } });
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function duplicateFunction(id: string, eventId: string) {
  const original = await prisma.function.findUnique({
    where: { id },
    include: {
      rooms: true,
      avNeeds: true,
      beoDetails: true,
    },
  });

  if (!original) {
    throw new Error("Function not found");
  }

  // Create duplicate
  const duplicate = await prisma.function.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      date: original.date,
      startTime: original.startTime,
      endTime: original.endTime,
      setupNotes: original.setupNotes,
      eventId: original.eventId,
      rooms: {
        create: original.rooms.map((r) => ({ roomId: r.roomId })),
      },
    },
  });

  // Copy AV needs
  if (original.avNeeds) {
    await prisma.aVNeeds.create({
      data: {
        functionId: duplicate.id,
        projector: original.avNeeds.projector,
        screen: original.avNeeds.screen,
        microphone: original.avNeeds.microphone,
        podium: original.avNeeds.podium,
        webcast: original.avNeeds.webcast,
        recording: original.avNeeds.recording,
        videoPlayback: original.avNeeds.videoPlayback,
        notes: original.avNeeds.notes,
      },
    });
  }

  // Copy BEO details
  if (original.beoDetails) {
    await prisma.bEODetails.create({
      data: {
        functionId: duplicate.id,
        guaranteeCount: original.beoDetails.guaranteeCount,
        tableSetup: original.beoDetails.tableSetup,
        menuNotes: original.beoDetails.menuNotes,
        dietaryNotes: original.beoDetails.dietaryNotes,
        beverageNotes: original.beoDetails.beverageNotes,
        notes: original.beoDetails.notes,
      },
    });
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}/functions/${duplicate.id}`);
}
