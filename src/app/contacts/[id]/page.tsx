import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getContact, updateContact, deleteContact } from "../actions";
import { ContactForm } from "../ContactForm";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

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
    await updateContact(id, formData);
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
        actions={<DeleteButton action={deleteContactAction} />}
      />

      <ContactForm contact={contact} contactRoles={contactRoles} action={updateContactWithId} />
    </PageWrapper>
  );
}
