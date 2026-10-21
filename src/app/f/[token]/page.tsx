import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DRAFT_COOKIE, findDraft, formLinkIsFull, getActiveFormLink, recordFormLinkAccess } from "@/lib/forms/links";
import { formConfig, loadFormSnapshot, rebaseDraftPayload } from "@/lib/forms/index";
import { functionReviewSetupTypes } from "@/lib/forms/functionReview";
import {
  FORM_ERROR_COPY,
  FORM_TYPE_LABEL,
  type FunctionReviewBaseline,
  type FunctionReviewPayload,
  type FunctionReviewSection,
} from "@/lib/forms/meta";
import { FormMessage, FormShell, type PublicFormDto } from "./FormShell";
import { FunctionReviewForm } from "./FunctionReviewForm";

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
  const snapshot = await loadFormSnapshot(link);
  const form: PublicFormDto = {
    eventName: link.event.name,
    title: FORM_TYPE_LABEL[link.formType],
    targetName: snapshot?.baseline.functionLabel ?? null,
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

  switch (link.formType) {
    case "FUNCTION_REVIEW": {
      const payload = draft
        ? rebaseDraftPayload(
            draft.payload as FunctionReviewPayload,
            draft.baseline as FunctionReviewBaseline | null,
            snapshot.baseline,
          )
        : null;
      return (
        <FormShell form={form}>
          <FunctionReviewForm
            token={link.token}
            version={snapshot.version}
            baseline={snapshot.baseline}
            sections={snapshot.sections as FunctionReviewSection[]}
            setupTypes={await functionReviewSetupTypes(link.eventId)}
            draft={
              draft
                ? {
                    payload,
                    submitterName: draft.submitterName,
                    submitterEmail: draft.submitterEmail,
                    submitterOrg: draft.submitterOrg,
                    files: draft.files,
                    savedAt: draft.updatedAt.toISOString(),
                  }
                : null
            }
            recipientName={link.recipientName}
            errorMessage={errorMessage}
            saved={saved === "1" && !!draft}
          />
        </FormShell>
      );
    }
    default: {
      const _exhaustive: never = link.formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}
