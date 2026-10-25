"use server";

import { notFound } from "next/navigation";
import { requirePermission, type PermissionAction } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { EntityStatus } from "@prisma/client";
import { instanceProgress, templateProgress, type WorkflowRowSummary } from "@/lib/workflowProgress";
import { loadWorkflowChecks, withWorkflowChecks } from "@/lib/workflowCheckData";
import { ENTITY_TYPE_RESOURCE } from "./entity-types";
import { WORKFLOW_ENTITY_DELEGATES } from "./entity-delegates";
import {
  autoAssignDefaultWorkflowsCore,
  recomputeEntityStatusCore,
  updateEntityStatusCore,
  type WorkflowEntityType as CoreWorkflowEntityType,
} from "./core";

export type WorkflowEntityType = CoreWorkflowEntityType;

// Confirms the entity actually belongs to the claimed event before mutation.
// Without this, a caller with ASSIGNED scope on event A could pass entityId from
// event B and the resource-level gate would still grant access.
async function assertEntityInEvent(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
) {
  const found = await WORKFLOW_ENTITY_DELEGATES[entityType].find(entityId, eventId);
  if (!found) notFound();
}

// Confirms the workflow instance actually belongs to the claimed entity.
// Prevents a caller from passing an instanceId from a different entity/event
// while satisfying the resource gate on the supplied entity.
async function assertInstanceMatches(
  instanceId: string,
  entityType: WorkflowEntityType,
  entityId: string,
) {
  const inst = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    select: { entityType: true, entityId: true },
  });
  if (!inst || inst.entityType !== entityType || inst.entityId !== entityId) notFound();
}

// Confirms a step / checklist item belongs to the instance's own template, so
// a completion can't be recorded against (or cascade from) a foreign step.
async function assertInInstanceTemplate(instanceId: string, ref: { stepId: string } | { itemId: string }) {
  const onInstance = { template: { instances: { some: { id: instanceId } } } };
  const found =
    "stepId" in ref
      ? await prisma.workflowStep.findFirst({ where: { id: ref.stepId, ...onInstance }, select: { id: true } })
      : await prisma.workflowChecklistItem.findFirst({ where: { id: ref.itemId, step: onInstance }, select: { id: true } });
  if (!found) notFound();
}

async function filterEntityIdsInEvent(
  entityType: WorkflowEntityType,
  entityIds: string[],
  eventId: string,
): Promise<string[]> {
  const rows = await WORKFLOW_ENTITY_DELEGATES[entityType].findMany(entityIds, eventId);
  return rows.map((r) => r.id);
}

async function gateWorkflowAction(
  entityType: WorkflowEntityType,
  eventId: string,
  action: PermissionAction,
) {
  return requirePermission(ENTITY_TYPE_RESOURCE[entityType], action, eventId);
}

function revalidateEntity(entityType: WorkflowEntityType, entityId: string, eventId: string) {
  revalidatePath(WORKFLOW_ENTITY_DELEGATES[entityType].path(eventId, entityId));
}

export async function getWorkflowInstances(entityType: WorkflowEntityType, entityId: string, eventId: string) {
  await gateWorkflowAction(entityType, eventId, "VIEW");
  await assertEntityInEvent(entityType, entityId, eventId);
  const instances = await prisma.workflowInstance.findMany({
    where: { entityType, entityId },
    include: {
      template: {
        include: {
          steps: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      stepCompletions: true,
      itemCompletions: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return withWorkflowChecks(instances);
}

export async function assignWorkflow(
  templateId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  // The template must be the event's tenant's own; a foreign id would attach
  // (and then render) another organization's workflow.
  const template = await prisma.workflowTemplate.findFirst({
    where: { id: templateId, tenant: { events: { some: { id: eventId } } } },
    select: { id: true },
  });
  if (!template) notFound();
  await prisma.workflowInstance.create({
    data: { templateId, entityType, entityId },
  });
  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function removeWorkflow(
  instanceId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await assertInstanceMatches(instanceId, entityType, entityId);
  await prisma.workflowInstance.delete({ where: { id: instanceId } });
  // Recompute status since a workflow was removed
  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function toggleStepCompletion(
  instanceId: string,
  stepId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await assertInstanceMatches(instanceId, entityType, entityId);
  await assertInInstanceTemplate(instanceId, { stepId });
  const existing = await prisma.workflowStepCompletion.findUnique({
    where: { instanceId_stepId: { instanceId, stepId } },
  });

  if (existing) {
    // Unchecking: drop this step's tick and cascade every later step (ticks
    // and items). Its own items stay; they're ticked separately.
    const steps = await prisma.workflowStep.findMany({
      where: { template: { instances: { some: { id: instanceId } } } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, items: { select: { id: true } } },
    });
    const stepIndex = steps.findIndex((s) => s.id === stepId);
    const laterSteps = steps.slice(stepIndex + 1);
    await prisma.workflowStepCompletion.deleteMany({
      where: { instanceId, stepId: { in: [stepId, ...laterSteps.map((s) => s.id)] } },
    });
    const laterItemIds = laterSteps.flatMap((s) => s.items.map((i) => i.id));
    if (laterItemIds.length > 0) {
      await prisma.workflowChecklistCompletion.deleteMany({
        where: { instanceId, itemId: { in: laterItemIds } },
      });
    }
  } else {
    await prisma.workflowStepCompletion.create({ data: { instanceId, stepId } });
  }

  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function getWorkflowBadgeSummaries(
  entityType: WorkflowEntityType,
  entityIds: string[],
  eventId: string
): Promise<Record<string, WorkflowRowSummary>> {
  await gateWorkflowAction(entityType, eventId, "VIEW");
  if (entityIds.length === 0) return {};

  // Restrict to ids that actually belong to this event; a caller could pass
  // ids from another event and the resource gate alone would still permit it.
  const ownedIds = await filterEntityIdsInEvent(entityType, entityIds, eventId);
  if (ownedIds.length === 0) return {};

  const instances = await prisma.workflowInstance.findMany({
    where: { entityType, entityId: { in: ownedIds } },
    include: {
      template: {
        include: {
          steps: {
            orderBy: { sortOrder: "asc" },
            include: { items: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      stepCompletions: true,
      itemCompletions: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const checks = await loadWorkflowChecks(entityType, ownedIds);
  const result: Record<string, WorkflowRowSummary> = {};

  for (const raw of instances) {
    const instance = { ...raw, checks: checks.get(raw.entityId) ?? [] };
    const eid = instance.entityId;
    if (!result[eid]) result[eid] = { count: 0, done: 0, total: 0, workflows: [] };
    result[eid].count += 1;
    result[eid].workflows.push({ id: instance.id, templateId: instance.templateId, name: instance.template.name, steps: templateProgress(instance).steps });

    const { ticksDone, ticksTotal } = instanceProgress(instance);
    result[eid].done += ticksDone;
    result[eid].total += ticksTotal;
  }

  return result;
}

export async function toggleItemCompletion(
  instanceId: string,
  itemId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await assertInstanceMatches(instanceId, entityType, entityId);
  await assertInInstanceTemplate(instanceId, { itemId });
  const existing = await prisma.workflowChecklistCompletion.findUnique({
    where: { instanceId_itemId: { instanceId, itemId } },
  });

  if (existing) {
    await prisma.workflowChecklistCompletion.delete({
      where: { instanceId_itemId: { instanceId, itemId } },
    });

    // Unticking a required item re-opens its step: drop the step's own
    // confirm (a PROMPT step) and cascade every later step. An optional item
    // never held the step, so nothing else moves.
    const item = await prisma.workflowChecklistItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { required: true, stepId: true },
    });
    if (item.required) {
      const steps = await prisma.workflowStep.findMany({
        where: { template: { instances: { some: { id: instanceId } } } },
        orderBy: { sortOrder: "asc" },
        select: { id: true, items: { select: { id: true } } },
      });
      const stepIndex = steps.findIndex((s) => s.id === item.stepId);
      const subsequentSteps = steps.slice(stepIndex + 1);
      await prisma.workflowStepCompletion.deleteMany({
        where: { instanceId, stepId: { in: [item.stepId, ...subsequentSteps.map((s) => s.id)] } },
      });
      const subsequentItemIds = subsequentSteps.flatMap((s) => s.items.map((i) => i.id));
      if (subsequentItemIds.length > 0) {
        await prisma.workflowChecklistCompletion.deleteMany({
          where: { instanceId, itemId: { in: subsequentItemIds } },
        });
      }
    }
  } else {
    await prisma.workflowChecklistCompletion.create({ data: { instanceId, itemId } });
  }

  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function setEntityStatus(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
  formData: FormData
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  const status = (formData.get("status") as EntityStatus | null) || null;
  const substatus = (formData.get("substatus") as string | null) || null;
  await updateEntityStatusCore(entityType, entityId, eventId, status, substatus);
  revalidateEntity(entityType, entityId, eventId);
}

export async function cancelEntity(
  entityType: WorkflowEntityType,
  entityId: string,
  substatus: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await updateEntityStatusCore(entityType, entityId, eventId, "CANCELLED", substatus);
  revalidateEntity(entityType, entityId, eventId);
}

export async function restoreEntity(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function autoAssignDefaultWorkflows(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await autoAssignDefaultWorkflowsCore(entityType, entityId, eventId);
}
