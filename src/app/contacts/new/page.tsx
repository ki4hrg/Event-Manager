import { PageWrapper } from "@/components/PageWrapper";
import { createContact } from "../actions";
import { ContactForm } from "../ContactForm";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
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
