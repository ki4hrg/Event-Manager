import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getContact, updateContact, deleteContact } from "../actions";
import { ContactForm } from "../ContactForm";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);

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
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href="/contacts"
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            ← Back to Contacts
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {contact.firstName} {contact.lastName}
          </h1>
        </div>
        <DeleteButton
          action={deleteContactAction}
          confirmMessage="Are you sure you want to delete this contact?"
        />
      </div>

      <ContactForm contact={contact} action={updateContactWithId} />
    </PageWrapper>
  );
}
