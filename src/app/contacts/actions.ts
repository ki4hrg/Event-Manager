"use server";

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createContactCore,
  updateContactCore,
  deleteContactCore,
  type ContactWriteArgs,
} from "./core";
import { formNote, formTexts, formValue } from "@/lib/validation";

export async function getContacts() {
  const session = await requirePermission(PermissionResource.CONTACTS, "VIEW");
  return prisma.contact.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function getContact(id: string) {
  const session = await requirePermission(PermissionResource.CONTACTS, "VIEW");
  return prisma.contact.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
}

function readContactArgs(formData: FormData): ContactWriteArgs {
  return {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    email: formNote(formData, "email"),
    phone: formNote(formData, "phone"),
    organization: formNote(formData, "organization"),
    notes: formNote(formData, "notes"),
    roles: formTexts(formData, "roles"),
  };
}

export async function createContact(formData: FormData) {
  const session = await requirePermission(PermissionResource.CONTACTS, "WRITE");
  await createContactCore(readContactArgs(formData), session.user.id, session.tenantId);
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function updateContact(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.CONTACTS, "WRITE");
  await updateContactCore(id, readContactArgs(formData), session.user.id, session.tenantId);
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}?success=Contact updated`);
}

export async function deleteContact(id: string) {
  const session = await requirePermission(PermissionResource.CONTACTS, "DELETE");
  await deleteContactCore(id, session.user.id, session.tenantId);
  revalidatePath("/contacts");
  redirect("/contacts");
}
