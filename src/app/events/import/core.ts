// Pure core for importing content from a previous event. NOT a "use server" file.
//
// This seeds a draft, it is not a clone. Functions land UNSCHEDULED by default
// so the unscheduled bucket reads as the to-do list for building the schedule;
// pulling last year's times is opt-in. Statuses are never carried over — they
// come from the target event's own defaults, so imported work starts as work.
//
// Run it again to bring MORE across (schedule now, orders later). It is not
// idempotent: importing the same function twice yields two functions, because
// without a per-row link back to the source there is nothing to recognize a
// repeat by, and that link was deliberately not added — it goes stale the
// moment last year's event is rescheduled. The picker flags target-name
// collisions instead, which is the same signal a person would use.

import { PermissionResource, type StatusModelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";

export type ImportSelection = {
  sourceEventId: string;
  targetEventId: string;
  functionIds: string[];
  presentationIds: string[];
  /** Pull last year's times. Off by default — see the file header. */
  includeSchedules: boolean;
  includeContacts: boolean;
  includeVendors: boolean;
  includeKeyStaff: boolean;
  includeStatusDefaults: boolean;
};

export type ImportResult = {
  functions: number;
  presentations: number;
  schedules: number;
  slots: number;
  vendors: number;
  keyStaff: number;
  statusDefaults: number;
  /** Plain statements about what did not come across, shown back to the user. */
  notes: string[];
};

export async function importFromEventCore(
  args: ImportSelection,
  userId: string,
): Promise<ImportResult> {
  const { sourceEventId, targetEventId } = args;
  if (sourceEventId === targetEventId) {
    throw new Error("Source and target events must be different");
  }

  await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", sourceEventId);
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", targetEventId);

  const wantFunctions = args.functionIds.length > 0;
  const wantPresentations = args.presentationIds.length > 0;
  if (wantFunctions) {
    await requirePermissionForUser(userId, PermissionResource.FUNCTIONS, "VIEW", sourceEventId);
    await requirePermissionForUser(userId, PermissionResource.FUNCTIONS, "WRITE", targetEventId);
  }
  if (wantPresentations) {
    await requirePermissionForUser(
      userId,
      PermissionResource.PRESENTATIONS,
      "VIEW",
      sourceEventId,
    );
    await requirePermissionForUser(
      userId,
      PermissionResource.PRESENTATIONS,
      "WRITE",
      targetEventId,
    );
  }

  // The flat categories read data the source event's own pages gate separately:
  // its vendor list behind VENDORS, its key staff behind CONTACTS. Without these
  // EVENTS VIEW on the source would be enough to lift either into an event the
  // caller controls, and read them there.
  if (args.includeVendors) {
    await requirePermissionForUser(userId, PermissionResource.VENDORS, "VIEW", sourceEventId);
    await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", targetEventId);
  }
  if (args.includeKeyStaff) {
    await requirePermissionForUser(userId, PermissionResource.CONTACTS, "VIEW", sourceEventId);
    await requirePermissionForUser(userId, PermissionResource.CONTACTS, "WRITE", targetEventId);
  }

  const [source, target] = await Promise.all([
    prisma.event.findUnique({
      where: { id: sourceEventId },
      select: {
        id: true,
        name: true,
        tenantId: true,
        venues: { select: { venue: { select: { id: true, name: true } } } },
      },
    }),
    prisma.event.findUnique({
      where: { id: targetEventId },
      select: {
        id: true,
        tenantId: true,
        venues: { select: { venue: { select: { id: true, rooms: { select: { id: true } } } } } },
      },
    }),
  ]);
  if (!source || !target) throw new PermissionError("NOT_FOUND");
  // Functions carry vendor, contact, and room references that only resolve
  // inside their own tenant; a cross-tenant copy would wire one tenant's rows
  // into another's event.
  if (source.tenantId !== target.tenantId) throw new PermissionError("NOT_FOUND");

  // Rooms belong to a venue, not an event. A room assignment carries over only
  // when the room's venue is also one of the target event's venues; anything
  // else would point at a room the target doesn't use.
  const targetRoomIds = new Set(target.venues.flatMap((v) => v.venue.rooms.map((r) => r.id)));
  const keepRoom = (roomId: string) => targetRoomIds.has(roomId);
  const targetVenueIds = new Set(target.venues.map((v) => v.venue.id));
  const missingVenues = source.venues
    .map((v) => v.venue)
    .filter((v) => !targetVenueIds.has(v.id));

  const notes: string[] = [];
  if (missingVenues.length > 0) {
    notes.push(
      `Room assignments at ${missingVenues.map((v) => v.name).join(", ")} were not carried over — not a venue of this event.`,
    );
  }
  if (!args.includeSchedules && wantFunctions) {
    notes.push("Functions were imported unscheduled.");
  }

  // Statuses come from the TARGET event's defaults. Read before the transaction:
  // resolveCreateStatus uses the global client and can't join it.
  const [functionStatus, presentationStatus] = await Promise.all([
    resolveCreateStatus(targetEventId, "FUNCTION" as StatusModelType),
    resolveCreateStatus(targetEventId, "PRESENTATION" as StatusModelType),
  ]);

  const result = await prisma.$transaction(
    async (tx) => {
      // oldId -> newId, per model. A junction row is only recreated when BOTH
      // of its endpoints were copied in this run.
      const functionMap = new Map<string, string>();
      const presentationMap = new Map<string, string>();
      const groupMap = new Map<string, string>();
      const trackMap = new Map<string, string>();

      let scheduleCount = 0;
      let slotCount = 0;

      const sourceFunctions = wantFunctions
        ? await tx.function.findMany({
            where: { id: { in: args.functionIds }, eventId: sourceEventId },
            include: {
              rooms: { select: { roomId: true } },
              schedules: true,
              contacts: true,
            },
          })
        : [];

      const sourcePresentations = wantPresentations
        ? await tx.presentation.findMany({
            where: { id: { in: args.presentationIds }, eventId: sourceEventId },
            include: { speakers: true, slots: true },
          })
        : [];

      // ── Groupings first: functions and presentations point at them. ────────
      // Reuse a target group/track of the same name rather than making a second
      // one, so re-running the import doesn't fan out duplicates.
      const groupIds = new Set(
        [...sourceFunctions, ...sourcePresentations]
          .map((r) => r.breakoutGroupId)
          .filter((v): v is string => !!v),
      );
      if (groupIds.size > 0) {
        const groups = await tx.breakoutGroup.findMany({
          where: { id: { in: Array.from(groupIds) }, eventId: sourceEventId },
          include: { rooms: { select: { roomId: true } } },
        });
        for (const g of groups) {
          const existing = await tx.breakoutGroup.findFirst({
            where: { eventId: targetEventId, name: g.name },
            select: { id: true },
          });
          if (existing) {
            groupMap.set(g.id, existing.id);
            continue;
          }
          const created = await tx.breakoutGroup.create({
            data: {
              eventId: targetEventId,
              name: g.name,
              sortOrder: g.sortOrder,
              rooms: {
                create: g.rooms.filter((r) => keepRoom(r.roomId)).map((r) => ({ roomId: r.roomId })),
              },
            },
            select: { id: true },
          });
          groupMap.set(g.id, created.id);
        }
      }

      const trackIds = new Set(
        sourcePresentations.map((p) => p.trackId).filter((v): v is string => !!v),
      );
      for (const trackId of Array.from(trackIds)) {
        const t = await tx.presentationTrack.findUnique({
          where: { id: trackId },
          select: { name: true, color: true, sortOrder: true },
        });
        if (!t) continue;
        const created = await tx.presentationTrack.upsert({
          where: { eventId_name: { eventId: targetEventId, name: t.name } },
          create: {
            eventId: targetEventId,
            name: t.name,
            color: t.color,
            sortOrder: t.sortOrder,
          },
          update: {},
          select: { id: true },
        });
        trackMap.set(trackId, created.id);
      }

      // ── Functions ──────────────────────────────────────────────────────────
      for (const fn of sourceFunctions) {
        const created = await tx.function.create({
          data: {
            eventId: targetEventId,
            name: fn.name,
            description: fn.description,
            type: fn.type,
            notes: fn.notes,
            offSiteLocation: fn.offSiteLocation,
            breakoutGroupId: fn.breakoutGroupId
              ? (groupMap.get(fn.breakoutGroupId) ?? null)
              : null,
            status: functionStatus.status,
            substatus: functionStatus.substatus,
            updatedById: userId,
            rooms: {
              create: fn.rooms.filter((r) => keepRoom(r.roomId)).map((r) => ({ roomId: r.roomId })),
            },
          },
          select: { id: true },
        });
        functionMap.set(fn.id, created.id);

        if (args.includeSchedules && fn.schedules.length > 0) {
          await tx.functionSchedule.createMany({
            data: fn.schedules.map((s) => ({
              functionId: created.id,
              type: s.type,
              startTime: s.startTime,
              endTime: s.endTime,
              notes: s.notes,
              isPublic: s.isPublic,
              sortOrder: s.sortOrder,
            })),
          });
          scheduleCount += fn.schedules.length;
        }

        // Contacts are global records — re-point at the same rows, never copy.
        if (args.includeContacts && fn.contacts.length > 0) {
          await tx.functionContact.createMany({
            data: fn.contacts.map((c) => ({
              functionId: created.id,
              contactId: c.contactId,
              role: c.role,
            })),
            skipDuplicates: true,
          });
        }
      }

      // ── Presentations ──────────────────────────────────────────────────────
      for (const p of sourcePresentations) {
        const created = await tx.presentation.create({
          data: {
            eventId: targetEventId,
            title: p.title,
            type: p.type,
            description: p.description,
            schedulingNotes: p.schedulingNotes,
            internalNotes: p.internalNotes,
            instanceCount: p.instanceCount,
            trackId: p.trackId ? (trackMap.get(p.trackId) ?? null) : null,
            breakoutGroupId: p.breakoutGroupId
              ? (groupMap.get(p.breakoutGroupId) ?? null)
              : null,
            status: presentationStatus.status,
            substatus: presentationStatus.substatus,
            updatedById: userId,
          },
          select: { id: true },
        });
        presentationMap.set(p.id, created.id);

        if (args.includeContacts && p.speakers.length > 0) {
          await tx.presentationContact.createMany({
            data: p.speakers.map((s) => ({
              presentationId: created.id,
              contactId: s.contactId,
              role: s.role,
              isPrimary: s.isPrimary,
              sortOrder: s.sortOrder,
            })),
            skipDuplicates: true,
          });
        }
      }

      // ── Slots: need both endpoints, and they're only meaningful with times ──
      if (args.includeSchedules) {
        // Every sourcePresentation is in presentationMap by now, so the block
        // function being copied too is the only real condition.
        const slots = sourcePresentations.flatMap((p) =>
          p.slots
            .filter((slot) => functionMap.has(slot.functionId))
            .map((slot) => ({
              presentationId: presentationMap.get(p.id)!,
              functionId: functionMap.get(slot.functionId)!,
              roomId: slot.roomId && keepRoom(slot.roomId) ? slot.roomId : null,
            })),
        );
        if (slots.length > 0) {
          await tx.presentationSlot.createMany({ data: slots, skipDuplicates: true });
          slotCount = slots.length;
        }
      }

      // Counted here, reported after the transaction commits: `notes` lives
      // outside the callback, and mutating it in here would repeat entries if
      // the transaction were ever retried.
      const droppedSlots = sourcePresentations.reduce(
        (n, p) => n + p.slots.filter((s) => !functionMap.has(s.functionId)).length,
        0,
      );

      // ── Event-level config ─────────────────────────────────────────────────
      let vendorCount = 0;
      let keyStaffCount = 0;
      let statusDefaultCount = 0;

      if (args.includeVendors) {
        const rows = await tx.eventVendor.findMany({ where: { eventId: sourceEventId } });
        const written = await tx.eventVendor.createMany({
          data: rows.map((v) => ({
            eventId: targetEventId,
            vendorId: v.vendorId,
            defaultFor: v.defaultFor,
          })),
          skipDuplicates: true,
        });
        vendorCount = written.count;
      }

      if (args.includeKeyStaff) {
        const [rows, existing] = await Promise.all([
          tx.eventKeyStaff.findMany({ where: { eventId: sourceEventId } }),
          tx.eventKeyStaff.findMany({
            where: { eventId: targetEventId },
            select: { contactId: true, title: true },
          }),
        ]);
        // @@unique([eventId, contactId, title]) can't carry the load here:
        // title is nullable and Postgres treats NULLs as distinct, so
        // skipDuplicates would let untitled staff through twice on a re-run.
        const seen = new Set(existing.map((k) => `${k.contactId}::${k.title ?? ""}`));
        const fresh = rows.filter(
          (k) => !seen.has(`${k.contactId}::${k.title ?? ""}`),
        );
        const written = await tx.eventKeyStaff.createMany({
          data: fresh.map((k) => ({
            eventId: targetEventId,
            contactId: k.contactId,
            title: k.title,
            models: k.models,
            sortOrder: k.sortOrder,
          })),
        });
        keyStaffCount = written.count;
      }

      if (args.includeStatusDefaults) {
        const rows = await tx.eventStatusDefault.findMany({
          where: { eventId: sourceEventId },
        });
        for (const d of rows) {
          await tx.eventStatusDefault.upsert({
            where: {
              eventId_modelType: { eventId: targetEventId, modelType: d.modelType },
            },
            create: {
              eventId: targetEventId,
              modelType: d.modelType,
              status: d.status,
              substatus: d.substatus,
            },
            update: { status: d.status, substatus: d.substatus },
          });
        }
        statusDefaultCount = rows.length;
      }

      return {
        functionIds: Array.from(functionMap.values()),
        presentationIds: Array.from(presentationMap.values()),
        functions: functionMap.size,
        presentations: presentationMap.size,
        schedules: scheduleCount,
        slots: slotCount,
        vendors: vendorCount,
        keyStaff: keyStaffCount,
        statusDefaults: statusDefaultCount,
        droppedSlots,
      };
    },
    // A few hundred writes for a full-schedule import; the 5s default is not enough.
    { timeout: 30_000, maxWait: 10_000 },
  );

  // Outside the transaction on purpose: autoAssignDefaultWorkflowsCore uses the
  // global client, so it can't join tx, and calling it inside would have it
  // wait on locks the transaction still holds. duplicateSetupOrderCore already
  // sequences it this way.
  for (const id of result.functionIds) {
    await autoAssignDefaultWorkflowsCore("function", id, targetEventId);
  }
  for (const id of result.presentationIds) {
    await autoAssignDefaultWorkflowsCore("presentation", id, targetEventId);
  }

  if (args.includeSchedules && result.droppedSlots > 0) {
    const n = result.droppedSlots;
    notes.push(
      `${n} breakout assignment${n === 1 ? "" : "s"} skipped — the block function wasn't imported.`,
    );
  }

  return {
    functions: result.functions,
    presentations: result.presentations,
    schedules: result.schedules,
    slots: result.slots,
    vendors: result.vendors,
    keyStaff: result.keyStaff,
    statusDefaults: result.statusDefaults,
    notes,
  };
}

/** The event an import should default to: the previous edition in the same series. */
export async function getDefaultImportSource(targetEventId: string) {
  const target = await prisma.event.findUnique({
    where: { id: targetEventId },
    select: { seriesId: true, startDate: true },
  });
  if (!target?.seriesId) return null;

  return prisma.event.findFirst({
    where: {
      seriesId: target.seriesId,
      startDate: { lt: target.startDate },
      id: { not: targetEventId },
    },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, timezone: true },
  });
}
