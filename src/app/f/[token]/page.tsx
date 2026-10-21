import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  DRAFT_COOKIE,
  activeBundleToken,
  findDraft,
  formLinkIsFull,
  getActiveFormBundle,
  getActiveFormLink,
  recordFormLinkAccess,
} from "@/lib/forms/links";
import { formConfig, formModule } from "@/lib/forms/index";
import { functionReviewSetupTypes } from "@/lib/forms/functionReview";
import {
  FORM_ERROR_COPY,
  FORM_TYPE_LABEL,
  formsHeading,
  readFormLinkConfig,
  type FunctionReviewBaseline,
  type FunctionReviewPayload,
  type FunctionReviewSection,
  type DeliverablesBaseline,
  type DeliverablesPayload,
  type DeliverablesSection,
  type SpeakerProfileBaseline,
  type SpeakerProfilePayload,
  type SpeakerProfileSection,
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
import { SpeakerProfileForm } from "./SpeakerProfileForm";

export const dynamic = "force-dynamic";

// Link previews (iMessage, Slack) read these: the form's name and its event,
// the same strings the page header shows anyone with the link.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const robots = { index: false, follow: false };
  const bundle = await getActiveFormBundle(token);
  const link = bundle ? null : await getActiveFormLink(token);
  if (!bundle && !link) return { title: { absolute: "Form" }, robots };
  const parts = bundle ? bundle.children : [link!];
  const event = (bundle?.link ?? link!).event;
  const snapshots = await Promise.all(parts.map((p) => formModule(p.formType).snapshot(p)));
  const heading = formsHeading(
    parts.map((p, i) => ({ formTitle: FORM_TYPE_LABEL[p.formType], targetName: snapshots[i]?.targetName ?? null })),
    event.name,
  );
  const title = [heading.formTitle, heading.targetName].filter(Boolean).join(" · ");
  return {
    title: { absolute: title },
    description: event.name,
    openGraph: { title, description: event.name, type: "website" },
    robots,
  };
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; submitted?: string; saved?: string }>;
}) {
  const { token } = await params;
  const { error, submitted, saved } = await searchParams;
  const bundle = await getActiveFormBundle(token);
  if (bundle) return <BundleIndex bundle={bundle} />;
  const link = await getActiveFormLink(token);
  if (!link) notFound();
  recordFormLinkAccess(link.id);

  const timezone = link.event.timezone || "America/Chicago";
  const bundleToken = await activeBundleToken(link.parentId);
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
    // The bundle index already showed the message.
    intro: bundleToken ? null : formConfig(link).intro ?? null,
    bundleHref: bundleToken ? `/f/${bundleToken}` : null,
  };

  if (submitted === "1") {
    return (
      <FormShell form={{ ...form, intro: null }}>
        <FormMessage title="Thank you — your response was received.">
          The event team will review it.
          {bundleToken && (
            <a href={`/f/${bundleToken}`} className="mt-3 block text-blue-600 dark:text-blue-400 hover:underline">
              Back to all forms
            </a>
          )}
        </FormMessage>
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
            uploadUrl={formConfig(link).mediaUploadUrl ?? null}
            baseline={snapshot.baseline as DeliverablesBaseline}
            sections={snapshot.sections as DeliverablesSection[]}
            draft={draftView && { ...draftView, payload: payload as DeliverablesPayload | null }}
          />
        </FormShell>
      );
    case "SPEAKER_PROFILE":
      return (
        <FormShell form={form}>
          <SpeakerProfileForm
            {...common}
            baseline={snapshot.baseline as SpeakerProfileBaseline}
            sections={snapshot.sections as SpeakerProfileSection[]}
            draft={draftView && { ...draftView, payload: payload as SpeakerProfilePayload | null }}
          />
        </FormShell>
      );
    default: {
      const _exhaustive: never = link.formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}

// A bundle's landing page: one row per form it holds. Like the forms, it gets
// only display strings, never the link rows.
async function BundleIndex({ bundle }: { bundle: NonNullable<Awaited<ReturnType<typeof getActiveFormBundle>>> }) {
  const { link, children } = bundle;
  recordFormLinkAccess(link.id);
  const timezone = link.event.timezone || "America/Chicago";
  const items = await Promise.all(
    children.map(async (child) => {
      const snapshot = await formModule(child.formType).snapshot(child);
      return {
        token: child.token,
        formTitle: FORM_TYPE_LABEL[child.formType],
        targetName: snapshot?.targetName ?? null,
        done: formLinkIsFull(child),
      };
    }),
  );
  const shown = items.filter((i) => i.targetName);
  const heading = formsHeading(shown, link.event.name);
  const mixed = new Set(shown.map((i) => i.formTitle)).size > 1;
  const form: PublicFormDto = {
    eventName: link.event.name,
    title: heading.formTitle,
    // A heading of "2 functions" says less than the list below it.
    targetName: shown.every((i) => i.targetName === heading.targetName) ? heading.targetName : null,
    recipientName: link.recipientName,
    dueAt: link.dueAt
      ? link.dueAt.toLocaleDateString("en-US", { timeZone: timezone, month: "long", day: "numeric", year: "numeric" })
      : null,
    intro: readFormLinkConfig(link.config, new Set()).intro ?? null,
  };
  if (shown.length === 0) notFound();
  return (
    <FormShell form={form}>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {shown.map((i) => (
          <li key={i.token}>
            <a href={`/f/${i.token}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
              <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-white break-words">
                {mixed ? i.formTitle : i.targetName}
                {mixed && i.targetName !== heading.targetName && (
                  <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">{i.targetName}</span>
                )}
              </span>
              <span className={`shrink-0 text-xs ${i.done ? "text-green-700 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>
                {i.done ? "Sent" : "Open"}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </FormShell>
  );
}
