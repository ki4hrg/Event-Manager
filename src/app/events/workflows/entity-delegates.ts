// Per-type Prisma delegates for the workflow entity types. Server-only: kept
// out of entity-types.ts because the status and workflow panels import that
// file into the client bundle. Not a "use server" file either — nothing here
// gates on permission, so none of it may become an RPC endpoint.
//
// A Record so a new WorkflowEntityType fails to compile until every operation
// is wired, instead of silently falling through a switch.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WorkflowEntityType } from "./entity-types";

type EntityDelegate = {
  // The entity when it belongs to the event; null for a missing or foreign id.
  find(id: string, eventId: string): Promise<{ id: string } | null>;
  // The subset of `ids` that belong to the event, with their status.
  findMany(ids: string[], eventId: string): Promise<{ id: string; status: EntityStatus | null; substatus: string | null }[]>;
  // Event ownership is in the where: a foreign id throws rather than writes.
  updateStatus(id: string, eventId: string, status: EntityStatus | null, substatus: string | null): Promise<unknown>;
  // The entity's detail route, revalidated after a workflow or status change.
  path(eventId: string, id: string): string;
};

const select = { id: true } as const;
const listSelect = { id: true, status: true, substatus: true } as const;

export const WORKFLOW_ENTITY_DELEGATES: Record<WorkflowEntityType, EntityDelegate> = {
  function: {
    find: (id, eventId) => prisma.function.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.function.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.function.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/functions/${id}`,
  },
  catering_order: {
    find: (id, eventId) => prisma.cateringOrder.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.cateringOrder.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.cateringOrder.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/catering-orders/${id}`,
  },
  av_order: {
    find: (id, eventId) => prisma.aVOrder.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.aVOrder.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.aVOrder.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/av-orders/${id}`,
  },
  print_order: {
    find: (id, eventId) => prisma.printOrder.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.printOrder.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.printOrder.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/print-orders/${id}`,
  },
  presentation: {
    find: (id, eventId) => prisma.presentation.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.presentation.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.presentation.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/presentations/${id}`,
  },
  setup_order: {
    find: (id, eventId) => prisma.setupOrder.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.setupOrder.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.setupOrder.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/setup-orders/${id}`,
  },
  supply_order: {
    find: (id, eventId) => prisma.supplyOrder.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.supplyOrder.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.supplyOrder.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/supply-orders/${id}`,
  },
  media_deliverable: {
    find: (id, eventId) => prisma.mediaDeliverable.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.mediaDeliverable.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.mediaDeliverable.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/media-deliverables/${id}`,
  },
  form_submission: {
    find: (id, eventId) => prisma.formSubmission.findFirst({ where: { id, eventId }, select }),
    findMany: (ids, eventId) => prisma.formSubmission.findMany({ where: { id: { in: ids }, eventId }, select: listSelect }),
    updateStatus: (id, eventId, status, substatus) =>
      prisma.formSubmission.update({ where: { id, eventId }, data: { status, substatus } }),
    path: (eventId, id) => `/events/${eventId}/forms/${id}`,
  },
};
