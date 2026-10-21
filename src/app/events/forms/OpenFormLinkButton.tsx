import type { FormType } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { isEmailConfigured } from "@/lib/email";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { createFormLink, getFormLinks, revokeFormLink } from "./actions";
import { FormLinkButton } from "./FormLinkButton";

// Link button for an open form (no target record): the forms page and the
// order and exhibit lists all mount it. Renders nothing without FORMS WRITE.
export async function OpenFormLinkButton({
  eventId,
  formType,
  title,
  targetSelect,
}: {
  eventId: string;
  formType: FormType;
  title: string;
  targetSelect?: React.ComponentProps<typeof FormLinkButton>["targetSelect"];
}) {
  if (!(await hasPermission("FORMS", "WRITE", eventId))) return null;
  const [links, templates] = await Promise.all([getFormLinks(eventId, { formType }), getWorkflowTemplateOptions()]);

  const create = async (formData: FormData) => {
    "use server";
    const { token, emailed } = await createFormLink(eventId, formData);
    return { token, emailed };
  };
  const revoke = async (linkId: string) => {
    "use server";
    await revokeFormLink(eventId, linkId);
  };

  return (
    <FormLinkButton
      title={title}
      formType={formType}
      defaultMaxSubmissions={null}
      targetSelect={targetSelect}
      workflowTemplates={templates}
      links={links}
      emailEnabled={isEmailConfigured()}
      defaultCloseDate={inThirtyDays()}
      create={create}
      revoke={revoke}
    />
  );
}

// YYYY-MM-DD for the close-date input.
function inThirtyDays(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
}
