import type { FormType } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { isEmailConfigured } from "@/lib/email";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";
import { getOptionsForEvent } from "@/lib/options";
import { createFormLink, deleteFormLink, getFormLinks, getFunctionReviewPicker, revokeFormLink } from "./actions";
import { FormLinkButton } from "./FormLinkButton";
import { ExhibitLinkFields } from "./ExhibitLinkFields";
import { getEvent } from "@/app/events/event";

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
  companion,
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
  companion?: ButtonProps["companion"];
  targetSelect?: ButtonProps["targetSelect"];
  requireRecipient?: boolean;
  externalUpload?: boolean;
  defaultCloseDate?: string;
}) {
  if (!(await hasPermission("FORMS", "WRITE", eventId))) return null;
  // Function Review picks its functions in the dialog, starting from this
  // page's function; their contacts are the recipients.
  const picksFunctions = formType === "FUNCTION_REVIEW";
  const [event, links, templates, functions, boothTypes] = await Promise.all([
    getEvent(eventId),
    getFormLinks(eventId, target ? { formType, [target.field]: target.id } : { formType }),
    getWorkflowTemplateOptions(),
    picksFunctions ? getFunctionReviewPicker(eventId) : null,
    formType === "EXHIBIT_REQUEST" ? getOptionsForEvent(eventId, "booth_type") : null,
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
  const deleteLink = async (linkId: string) => {
    "use server";
    await deleteFormLink(eventId, linkId);
  };

  return (
    <FormLinkButton
      title={title}
      formType={formType}
      targetField={target && !functions ? { name: target.field, value: target.id } : undefined}
      functionPicker={functions ? { options: functions, initial: target ? [target.id] : [] } : undefined}
      sections={sections}
      companion={companion}
      recipients={recipients}
      extraFields={boothTypes ? <ExhibitLinkFields boothTypes={boothTypes.map((o) => o.label)} /> : undefined}
      // Targeted links go to one person; open links take any number.
      defaultMaxSubmissions={target || functions ? 1 : null}
      defaultAnyone={!target && !functions}
      targetSelect={targetSelect}
      requireRecipient={requireRecipient}
      externalUpload={externalUpload}
      workflowTemplates={templates}
      links={links}
      emailEnabled={isEmailConfigured()}
      defaultCloseDate={defaultCloseDate ?? defaultFormCloseDate(event?.startDate ?? null)}
      create={create}
      revoke={revoke}
      deleteLink={deleteLink}
    />
  );
}

// A form link stays open until the event starts, or 30 days when that's
// sooner or already past. YYYY-MM-DD for the date input.
function defaultFormCloseDate(eventStart: Date | null): string {
  const inMonth = new Date(Date.now() + 30 * 86_400_000);
  const start = eventStart && eventStart.getTime() > Date.now() + 86_400_000 ? eventStart : null;
  return (start && start < inMonth ? start : inMonth).toISOString().slice(0, 10);
}
