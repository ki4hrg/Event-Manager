"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { loadEsgNarrativeData } from "@/lib/esg/narrativeData";
import { ESG_HEADER_FIELDS, SPEC_GRID_COLUMNS, SPEC_GRIDS, getEsgSection, type SpecGrid } from "@/lib/esg/fields";
import { parseEsgForm } from "@/lib/esg/parse";
import {
  createSpecRowCore,
  deleteSpecRowCore,
  issueEsgCore,
  setSpecSectionNaCore,
  updateSpecRowCore,
  upsertEventSpecificationCore,
} from "./core";
import { setFunctionNumbersLockedCore } from "../functions/core";

async function eventTimezone(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  return event?.timezone || "America/Chicago";
}

function assertGrid(grid: string): asserts grid is SpecGrid {
  if (!(SPEC_GRIDS as readonly string[]).includes(grid)) throw new Error(`Unknown grid: ${grid}`);
}

function revalidateSpec(eventId: string) {
  revalidatePath(`/events/${eventId}/specifications`);
}

export async function getEventSpecification(eventId: string) {
  await requirePermission("EVENTS", "VIEW", eventId);
  return loadEsgNarrativeData(eventId);
}

// One section's form (letter "header" for Date Originated / Revised).
export async function updateSpecificationSection(eventId: string, letter: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  const fields = letter === "header" ? ESG_HEADER_FIELDS : getEsgSection(letter)?.fields;
  if (!fields) throw new Error(`Unknown ESG section: ${letter}`);
  const values = parseEsgForm(fields, formData, await eventTimezone(eventId));
  await upsertEventSpecificationCore(eventId, values, session.user.id);
  revalidateSpec(eventId);
  redirect(`/events/${eventId}/specifications?success=Saved#spec-${letter.toLowerCase()}`);
}

export async function setSpecificationSectionNa(eventId: string, letter: string, na: boolean) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await setSpecSectionNaCore(eventId, letter, na, session.user.id);
  revalidateSpec(eventId);
}

export async function createSpecificationRow(eventId: string, grid: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  assertGrid(grid);
  const values = parseEsgForm(SPEC_GRID_COLUMNS[grid], formData, await eventTimezone(eventId));
  await createSpecRowCore(eventId, grid, values, session.user.id);
  revalidateSpec(eventId);
}

export async function updateSpecificationRow(eventId: string, grid: string, rowId: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  assertGrid(grid);
  const values = parseEsgForm(SPEC_GRID_COLUMNS[grid], formData, await eventTimezone(eventId));
  await updateSpecRowCore(eventId, grid, rowId, values, session.user.id);
  revalidateSpec(eventId);
}

export async function deleteSpecificationRow(eventId: string, grid: string, rowId: string) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  assertGrid(grid);
  await deleteSpecRowCore(eventId, grid, rowId, session.user.id);
  revalidateSpec(eventId);
}

export async function issueEsg(eventId: string) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await issueEsgCore(eventId, session.user.id);
  revalidateSpec(eventId);
  revalidatePath(`/events/${eventId}/functions`);
}

export async function unlockFunctionNumbers(eventId: string) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await setFunctionNumbersLockedCore(eventId, false, session.user.id);
  revalidateSpec(eventId);
  revalidatePath(`/events/${eventId}/functions`);
}
