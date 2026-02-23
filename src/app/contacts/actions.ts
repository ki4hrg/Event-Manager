"use server";

import { prisma } from "@/lib/prisma";
import { ContactRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getContacts() {
  return prisma.contact.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
  });
}

export async function createContact(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const organization = formData.get("organization") as string;
  const notes = formData.get("notes") as string;
  const roles = formData.getAll("roles") as ContactRole[];

  const contact = await prisma.contact.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      organization: organization || null,
      notes: notes || null,
      roles,
    },
  });

  revalidatePath("/contacts");
  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const organization = formData.get("organization") as string;
  const notes = formData.get("notes") as string;
  const roles = formData.getAll("roles") as ContactRole[];

  await prisma.contact.update({
    where: { id },
    data: {
      name,
      email: email || null,
      phone: phone || null,
      organization: organization || null,
      notes: notes || null,
      roles,
    },
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}?success=Contact updated`);
}

export async function deleteContact(id: string) {
  await prisma.contact.delete({ where: { id } });
  revalidatePath("/contacts");
  redirect("/contacts");
}
