import type { Metadata } from "next";
import { PageWrapper } from "@/components/PageWrapper";
import { createContact } from "../actions";
import { ContactForm } from "../ContactForm";
import { getOptions } from "@/app/settings/actions";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage() {
  // A VIEW-only user has no business on a create form.
  await requirePermission("CONTACTS", "WRITE");
  const contactRoles = await getOptions("contact_role");

  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        New Contact
      </h1>
      <ContactForm contactRoles={contactRoles} action={createContact} />
    </PageWrapper>
  );
}
