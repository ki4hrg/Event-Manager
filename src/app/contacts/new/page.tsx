import { PageWrapper } from "@/components/PageWrapper";
import { createContact } from "../actions";
import { ContactForm } from "../ContactForm";

export const dynamic = "force-dynamic";

export default function NewContactPage() {
  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        New Contact
      </h1>
      <ContactForm action={createContact} />
    </PageWrapper>
  );
}
