import type { FormType } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { isEmailConfigured } from "@/lib/email";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { createFormLink, getFormLinks, revokeFormLink } from "./actions";
import { FormLinkButton } from "./FormLinkButton";

type ButtonProps = React.ComponentProps<typeof FormLinkButton>;

// The link button every form type mounts on its entry page: the function and
// presentation pages for targeted forms, the forms page and order/exhibit
// lists for open ones. Renders nothing without FORMS WRITE.
export async function FormLinkEntry({
  eventId,
  formType,
  title,
  target,
  recipients,
  sections,
  targetSelect,
  requireRecipient,
  externalUpload,
  defaultCloseDate,
}: {
  eventId: string;
  formType: FormType;
  title: string;
  // A targeted form's record; open forms omit it.
  target?: { field: "functionId" | "presentationId"; id: string };
  recipients?: ButtonProps["recipients"];
  sections?: ButtonProps["sections"];
  targetSelect?: ButtonProps["targetSelect"];
  requireRecipient?: boolean;
  externalUpload?: boolean;
  defaultCloseDate?: string;
}) {
  if (!(await hasPermission("FORMS", "WRITE", eventId))) return null;
  const [links, templates] = await Promise.all([
    getFormLinks(eventId, target ? { formType, [target.field]: target.id } : { formType }),
    getWorkflowTemplateOptions(),
  ]);

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
      targetField={target ? { name: target.field, value: target.id } : undefined}
      sections={sections}
      recipients={recipients}
      // Targeted links go to one person; open links take any number.
      defaultMaxSubmissions={target ? 1 : null}
      targetSelect={targetSelect}
      requireRecipient={requireRecipient}
      externalUpload={externalUpload}
      workflowTemplates={templates}
      links={links}
      emailEnabled={isEmailConfigured()}
      defaultCloseDate={defaultCloseDate ?? inThirtyDays()}
      create={create}
      revoke={revoke}
    />
  );
}

// YYYY-MM-DD for the close-date input.
function inThirtyDays(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
}
