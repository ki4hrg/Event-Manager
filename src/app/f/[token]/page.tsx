import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DRAFT_COOKIE, findDraft, formLinkIsFull, getActiveFormLink, recordFormLinkAccess } from "@/lib/forms/links";
import { formConfig, formModule } from "@/lib/forms/index";
import { functionReviewSetupTypes } from "@/lib/forms/functionReview";
import {
  FORM_ERROR_COPY,
  FORM_TYPE_LABEL,
  type FunctionReviewBaseline,
  type FunctionReviewPayload,
  type FunctionReviewSection,
  type DeliverablesBaseline,
  type DeliverablesPayload,
  type DeliverablesSection,
  type ExhibitRequestBaseline,
  type ExhibitRequestPayload,
  type ItemRequestBaseline,
  type ItemRequestPayload,
} from "@/lib/forms/meta";
import { FormMessage, FormShell, type PublicFormDto } from "./FormShell";
import { FunctionReviewForm } from "./FunctionReviewForm";
import { ItemRequestForm } from "./ItemRequestForm";
import { ExhibitRequestForm } from "./ExhibitRequestForm";
import { DeliverablesForm } from "./DeliverablesForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Form",
  robots: { index: false, follow: false },
};

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; submitted?: string; saved?: string }>;
}) {
  const { token } = await params;
  const { error, submitted, saved } = await searchParams;
  const link = await getActiveFormLink(token);
  if (!link) notFound();
  recordFormLinkAccess(link.id);

  const timezone = link.event.timezone || "America/Chicago";
  const mod = formModule(link.formType);
  const snapshot = await mod.snapshot(link);
  const form: PublicFormDto = {
    eventName: link.event.name,
    title: FORM_TYPE_LABEL[link.formType],
    // Open forms target the event itself, already in the header.
    targetName: snapshot && snapshot.targetName !== link.event.name ? snapshot.targetName : null,
    recipientName: link.recipientName,
    dueAt: link.dueAt
      ? link.dueAt.toLocaleDateString("en-US", { timeZone: timezone, month: "long", day: "numeric", year: "numeric" })
      : null,
    intro: formConfig(link).intro ?? null,
  };

  if (submitted === "1") {
    return (
      <FormShell form={{ ...form, intro: null }}>
        <FormMessage title="Thank you — your response was received.">The event team will review it.</FormMessage>
      </FormShell>
    );
  }
  if (!snapshot) notFound();
  if (formLinkIsFull(link)) {
    return (
      <FormShell form={{ ...form, intro: null }}>
        <FormMessage title="This form has already been submitted.">Contact the event team to make further changes.</FormMessage>
      </FormShell>
    );
  }

  const draft = await findDraft(link.id, (await cookies()).get(DRAFT_COOKIE)?.value);
  const errorMessage = error ? FORM_ERROR_COPY[error] ?? FORM_ERROR_COPY.invalid : null;
  // A saved draft follows the record where the submitter left a field as shown.
  const payload = draft ? mod.rebase(draft.payload, draft.baseline, snapshot.baseline) : null;
  const draftView = draft
    ? {
        submitterName: draft.submitterName,
        submitterEmail: draft.submitterEmail,
        submitterOrg: draft.submitterOrg,
        files: draft.files,
      }
    : null;
  const common = {
    token: link.token,
    version: snapshot.version,
    recipientName: link.recipientName,
    errorMessage,
    saved: saved === "1" && !!draft,
  };

  switch (link.formType) {
    case "FUNCTION_REVIEW":
      return (
        <FormShell form={form}>
          <FunctionReviewForm
            {...common}
            baseline={snapshot.baseline as FunctionReviewBaseline}
            sections={snapshot.sections as FunctionReviewSection[]}
            setupTypes={await functionReviewSetupTypes(link.eventId)}
            draft={draftView && { ...draftView, payload: payload as FunctionReviewPayload | null }}
          />
        </FormShell>
      );
    case "ITEM_REQUEST":
      return (
        <FormShell form={form}>
          <ItemRequestForm
            {...common}
            baseline={snapshot.baseline as ItemRequestBaseline}
            draft={draftView && { ...draftView, payload: payload as ItemRequestPayload | null }}
          />
        </FormShell>
      );
    case "EXHIBIT_REQUEST":
      return (
        <FormShell form={form}>
          <ExhibitRequestForm
            {...common}
            baseline={snapshot.baseline as ExhibitRequestBaseline}
            draft={draftView && { ...draftView, payload: payload as ExhibitRequestPayload | null }}
          />
        </FormShell>
      );
    case "PRESENTATION_DELIVERABLES":
      return (
        <FormShell form={form}>
          <DeliverablesForm
            {...common}
            baseline={snapshot.baseline as DeliverablesBaseline}
            sections={snapshot.sections as DeliverablesSection[]}
            draft={draftView && { ...draftView, payload: payload as DeliverablesPayload | null }}
          />
        </FormShell>
      );
    default: {
      const _exhaustive: never = link.formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}
