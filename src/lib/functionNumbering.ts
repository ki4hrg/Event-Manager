// Assigns ESG function numbers (APEX ESG "Instructions for Use" #3):
//
// - Unlocked (planning): scheduled functions are numbered 1…N in chronological
//   order after every mutation that can change the set or its timing. Pinned
//   numbers (manual overrides) stay put and are skipped. Unscheduled and
//   cancelled functions carry no number.
// - Locked (ESG issued): numbers never move. A function that gains a schedule
//   gets an intermediate number from its time slot (between #4 and #5 → "4a").
//   Deleted functions' numbers are retired and never reused; cancelled ones
//   keep theirs.
// - Breakout blocks give each effective room a stable letter (12a, 12b, …).
//
// Called from the function / schedule / breakout / import cores after their
// own writes; it runs its own transaction rather than joining theirs.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { functionStartKey } from "@/lib/esg/scheduleKey";
import { baseInteger, compareFunctionNumbers, letterSuffix } from "@/lib/functionNumbers";

type Tx = Prisma.TransactionClient;

const SETUP_FALLBACK_LABELS = new Set(["Setup", "Breakdown"]);

// Schedule-type labels that are set-up / tear-down rows, not the function
// itself — excluded when placing a function in time.
async function supportScheduleLabels(tx: Tx, eventId: string): Promise<Set<string>> {
  const options = await tx.customOption.findMany({
    where: { category: "schedule_type", tenant: { events: { some: { id: eventId } } } },
    select: { label: true, group: true },
  });
  const grouped = options.filter((o) => o.group === "SETUP" || o.group === "TEARDOWN");
  return grouped.length > 0 ? new Set(grouped.map((o) => o.label)) : SETUP_FALLBACK_LABELS;
}


async function loadForNumbering(tx: Tx, eventId: string) {
  return tx.function.findMany({
    where: { eventId },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      functionNumber: true,
      functionNumberPinned: true,
      schedules: { select: { type: true, startTime: true, endTime: true, isPublic: true } },
      breakoutGroup: { select: { rooms: { select: { roomId: true, room: { select: { name: true } } } } } },
      sessionRoomOverrides: { select: { roomId: true, type: true, room: { select: { name: true } } } },
      roomNumbers: { select: { roomId: true, suffix: true } },
    },
  });
}

type NumberingRow = Awaited<ReturnType<typeof loadForNumbering>>[number];

function effectiveBreakoutRooms(fn: NumberingRow): { roomId: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const gr of fn.breakoutGroup?.rooms ?? []) byId.set(gr.roomId, gr.room.name);
  for (const o of fn.sessionRoomOverrides) {
    if (o.type === "exclude") byId.delete(o.roomId);
    else if (o.type === "include") byId.set(o.roomId, o.room.name);
  }
  return Array.from(byId.entries())
    .map(([roomId, name]) => ({ roomId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function writeNumbers(tx: Tx, changes: Map<string, string | null>) {
  if (changes.size === 0) return;
  const ids = Array.from(changes.keys());
  // Two passes so a swap (3↔4) never trips @@unique([eventId, functionNumber]).
  await tx.function.updateMany({ where: { id: { in: ids } }, data: { functionNumber: null } });
  for (const [id, number] of Array.from(changes.entries())) {
    if (number !== null) await tx.function.update({ where: { id }, data: { functionNumber: number } });
  }
}

async function syncOnce(eventId: string) {
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { functionNumbersLockedAt: true },
    });
    if (!event) return;
    const locked = event.functionNumbersLockedAt !== null;
    const [fns, support, retired] = await Promise.all([
      loadForNumbering(tx, eventId),
      supportScheduleLabels(tx, eventId),
      tx.retiredFunctionNumber.findMany({ where: { eventId }, select: { number: true } }),
    ]);

    const keyed = fns.map((fn) => ({ fn, key: functionStartKey(fn.schedules, support) }));
    const chronological = keyed
      .filter((k) => k.key !== null)
      .sort((a, b) => a.key! - b.key! || a.fn.name.localeCompare(b.fn.name) || a.fn.id.localeCompare(b.fn.id));

    const target = new Map<string, string | null>(fns.map((fn) => [fn.id, fn.functionNumber]));

    if (!locked) {
      const pinned = new Set(fns.filter((f) => f.functionNumberPinned && f.functionNumber).map((f) => f.functionNumber!));
      let n = 1;
      for (const { fn } of chronological) {
        if (fn.functionNumberPinned) continue;
        if (fn.status === "CANCELLED") {
          target.set(fn.id, null);
          continue;
        }
        while (pinned.has(String(n))) n++;
        target.set(fn.id, String(n++));
      }
      for (const { fn, key } of keyed) {
        if (key === null && !fn.functionNumberPinned) target.set(fn.id, null);
      }
    } else {
      const used = new Set<string>([
        ...retired.map((r) => r.number),
        ...fns.map((f) => f.functionNumber).filter((n): n is string => !!n),
      ]);
      // Each newly scheduled function slots in after the highest number that
      // falls earlier in time. If a higher number follows later, it takes an
      // intermediate number ("4a"); otherwise it appends (max + 1).
      chronological.forEach(({ fn }, idx) => {
        if (target.get(fn.id)) return;
        const numberAt = (i: number) => target.get(chronological[i].fn.id) ?? null;
        let earlierMax: string | null = null;
        for (let i = 0; i < idx; i++) {
          const n = numberAt(i);
          if (n && baseInteger(n) !== null && (!earlierMax || compareFunctionNumbers(n, earlierMax) > 0)) {
            earlierMax = n;
          }
        }
        let higherLater = false;
        for (let i = idx + 1; i < chronological.length; i++) {
          const n = numberAt(i);
          if (n && baseInteger(n) !== null && (!earlierMax || compareFunctionNumbers(n, earlierMax) > 0)) {
            higherLater = true;
            break;
          }
        }
        const number = intermediateNumber(higherLater ? earlierMax : null, used);
        used.add(number);
        target.set(fn.id, number);
      });
    }

    const changes = new Map<string, string | null>();
    for (const fn of fns) {
      const next = target.get(fn.id) ?? null;
      if (next !== fn.functionNumber) changes.set(fn.id, next);
    }
    await writeNumbers(tx, changes);

    // Breakout room letters.
    for (const fn of fns) {
      if (fn.type !== "BREAKOUT_BLOCK") continue;
      const rooms = effectiveBreakoutRooms(fn);
      if (!locked) {
        // While planning, letters simply follow room order.
        const want = rooms.map((r, i) => ({ roomId: r.roomId, suffix: letterSuffix(i) }));
        const same =
          want.length === fn.roomNumbers.length &&
          want.every((w) => fn.roomNumbers.some((rn) => rn.roomId === w.roomId && rn.suffix === w.suffix));
        if (!same) {
          await tx.functionRoomNumber.deleteMany({ where: { functionId: fn.id } });
          if (want.length > 0) {
            await tx.functionRoomNumber.createMany({ data: want.map((w) => ({ functionId: fn.id, ...w })) });
          }
        }
      } else {
        // Once issued, letters are permanent; new rooms get the next unused one.
        const have = new Set(fn.roomNumbers.map((rn) => rn.roomId));
        const usedSuffixes = new Set(fn.roomNumbers.map((rn) => rn.suffix));
        let i = 0;
        for (const room of rooms) {
          if (have.has(room.roomId)) continue;
          while (usedSuffixes.has(letterSuffix(i))) i++;
          const suffix = letterSuffix(i);
          usedSuffixes.add(suffix);
          await tx.functionRoomNumber.create({ data: { functionId: fn.id, roomId: room.roomId, suffix } });
        }
      }
    }
  });
}

// Between the chronological predecessor and the next number: predecessor's
// integer plus the next free letter. No predecessor → next whole number.
function intermediateNumber(predecessor: string | null, used: Set<string>): string {
  const base = predecessor ? baseInteger(predecessor) : null;
  if (base === null) {
    let max = 0;
    used.forEach((n) => {
      max = Math.max(max, baseInteger(n) ?? 0);
    });
    return String(max + 1);
  }
  let i = 0;
  while (used.has(`${base}${letterSuffix(i)}`)) i++;
  return `${base}${letterSuffix(i)}`;
}

export async function syncFunctionNumbers(eventId: string) {
  try {
    await syncOnce(eventId);
  } catch (e) {
    // A concurrent sync on the same event can race the unique index; the
    // second attempt sees the first one's result.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await syncOnce(eventId);
      return;
    }
    throw e;
  }
}

// Call before deleting functions: once numbering is locked, their numbers
// must never be handed out again.
export async function retireFunctionNumbers(eventId: string, functionIds: string[]) {
  if (functionIds.length === 0) return;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { functionNumbersLockedAt: true },
  });
  if (!event?.functionNumbersLockedAt) return;
  const fns = await prisma.function.findMany({
    where: { id: { in: functionIds }, eventId, functionNumber: { not: null } },
    select: { functionNumber: true },
  });
  if (fns.length === 0) return;
  await prisma.retiredFunctionNumber.createMany({
    data: fns.map((f) => ({ eventId, number: f.functionNumber! })),
    skipDuplicates: true,
  });
}

// Validates a manual override. Returns the normalized number (or null to
// clear the pin and let the engine assign).
export async function validateFunctionNumberOverride(
  eventId: string,
  functionId: string | null,
  raw: string | null | undefined,
): Promise<string | null> {
  const value = (raw ?? "").trim().replace(/^#/, "");
  if (!value) return null;
  if (!/^[0-9A-Za-z.\-]{1,12}$/.test(value)) {
    throw new Error("Function numbers may use letters, digits, '.' and '-' (e.g. 12, 4a).");
  }
  const [clash, retired] = await Promise.all([
    prisma.function.findFirst({
      where: { eventId, functionNumber: value, ...(functionId ? { NOT: { id: functionId } } : {}) },
      select: { name: true },
    }),
    prisma.retiredFunctionNumber.findUnique({ where: { eventId_number: { eventId, number: value } } }),
  ]);
  if (clash) throw new Error(`Function #${value} is already used by "${clash.name}".`);
  if (retired) throw new Error(`Function #${value} belonged to a deleted function and can't be reused.`);
  return value;
}

export async function setFunctionNumbersLocked(eventId: string, locked: boolean) {
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: { functionNumbersLockedAt: locked ? new Date() : null },
    });
    // Re-planning starts from a clean slate: the retired list only guards
    // numbers that were published.
    if (!locked) await tx.retiredFunctionNumber.deleteMany({ where: { eventId } });
  });
  await syncFunctionNumbers(eventId);
}

// "Renumber chronologically" on the functions list. Optionally drops manual
// pins first. Only meaningful while unlocked.
export async function renumberFunctions(eventId: string, clearPins: boolean) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { functionNumbersLockedAt: true },
  });
  if (event?.functionNumbersLockedAt) {
    throw new Error("Function numbers are locked because the ESG has been issued. Unlock numbering first.");
  }
  if (clearPins) {
    await prisma.function.updateMany({ where: { eventId }, data: { functionNumberPinned: false } });
  }
  await syncFunctionNumbers(eventId);
}

