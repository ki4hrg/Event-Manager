import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/tenant";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getContact, updateContact, deleteContact } from "../actions";
import { ContactForm } from "../ContactForm";
import { getOptions } from "@/app/(admin)/settings/actions";
import { LastUpdated } from "@/components/LastUpdated";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: (await getActiveTenantId()) ?? "" },
    select: { firstName: true, lastName: true },
  });
  if (!contact) return { title: "Contact" };
  return { title: `${contact.firstName} ${contact.lastName}`.trim() || "Contact" };
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, contactRoles] = await Promise.all([
    getContact(id),
    getOptions("contact_role"),
  ]);

  if (!contact) {
    notFound();
  }

  const updateContactWithId = async (formData: FormData) => {
    "use server";
    return updateContact(id, formData);
  };

  const deleteContactAction = async () => {
    "use server";
    await deleteContact(id);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[{ label: "Contacts", href: "/contacts" }, { label: `${contact.firstName} ${contact.lastName}` }]}
        title={`${contact.firstName} ${contact.lastName}`}
        meta={<LastUpdated updatedAt={contact.updatedAt} updatedBy={contact.updatedBy} />}
        actions={<DeleteButton resource="CONTACTS" action={deleteContactAction} />}
      />

      <ContactForm contact={contact} contactRoles={contactRoles} action={updateContactWithId} />
    </PageWrapper>
  );
}
