"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getContacts() {
  return prisma.contact.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
  });
}

export async function createContact(formData: FormData) {
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const organization = formData.get("organization") as string;
  const notes = formData.get("notes") as string;
  const roles = formData.getAll("roles") as string[];

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      organization: organization || null,
      notes: notes || null,
      roles,
    },
  });

  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function updateContact(id: string, formData: FormData) {
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
