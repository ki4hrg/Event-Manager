"use server";

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getContacts() {
  await requirePermission(PermissionResource.CONTACTS, "VIEW");
  return prisma.contact.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function getContact(id: string) {
  await requirePermission(PermissionResource.CONTACTS, "VIEW");
  return prisma.contact.findUnique({
    where: { id },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
}

export async function createContact(formData: FormData) {
  const session = await requirePermission(PermissionResource.CONTACTS, "WRITE");
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const organization = formData.get("organization") as string;
  const notes = formData.get("notes") as string;
  const roles = formData.getAll("roles") as string[];

  await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      organization: organization || null,
      notes: notes || null,
      roles,
      updatedById: session.user.id,
    },
  });

  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function updateContact(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.CONTACTS, "WRITE");
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const organization = formData.get("organization") as string;
  const notes = formData.get("notes") as string;
  const roles = formData.getAll("roles") as string[];

  await prisma.contact.update({
    where: { id },
    data: {
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      organization: organization || null,
      notes: notes || null,
      roles,
      updatedById: session.user.id,
    },
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}?success=Contact updated`);
}

export async function deleteContact(id: string) {
  await requirePermission(PermissionResource.CONTACTS, "DELETE");
  await prisma.contact.delete({ where: { id } });
  revalidatePath("/contacts");
  redirect("/contacts");
}
