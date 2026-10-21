import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { WorkflowStatusBadge, computeWorkflowBadgeSummary } from "@/components/WorkflowStatusBadge";
import { hasPermission } from "@/lib/permissions";
import { formatFileSize } from "@/lib/uploads";
import { FORM_STATE_LABEL, FORM_TYPE_LABEL } from "@/lib/forms/meta";
import { getEvent } from "../../../actions";
import { applyFormSubmission, getFormSubmissionReview, rejectFormSubmission } from "../../../forms/actions";
import { FormDiff, FormReview } from "../../../forms/FormReview";
import { workflowCompletionCore } from "../../../workflows/core";
import {
  assignWorkflow,
  getWorkflowInstances,
  removeWorkflow,
  toggleItemCompletion,
  toggleStepCompletion,
} from "../../../workflows/actions";
import { getWorkflowTemplateOptions } from "@/app/workflows/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Form submission" };

export default async function FormSubmissionPage({ params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const { id: eventId, submissionId } = await params;
  const [event, review] = await Promise.all([getEvent(eventId), getFormSubmissionReview(eventId, submissionId)]);
  if (!event || !review) notFound();
  const { submission } = review;
  const timezone = event.timezone || "America/Chicago";

  const [workflowInstances, allTemplates, canWrite, completion] = await Promise.all([
    getWorkflowInstances("form_submission", submissionId, eventId),
    getWorkflowTemplateOptions(),
    hasPermission("FORMS", "WRITE", eventId),
    workflowCompletionCore("form_submission", submissionId),
  ]);
  const assignedTemplateIds = new Set(workflowInstances.map((i) => i.templateId));
  const availableWorkflowTemplates = allTemplates.filter((t) => !assignedTemplateIds.has(t.id));

  const requiredMissing = !!submission.requiredTemplateId && !completion.templateIds.has(submission.requiredTemplateId);
  const approvalMessage = requiredMissing
    ? "The approval workflow this form requires was removed. Assign it again and complete it to apply."
    : !completion.complete
      ? "Finish the approval workflow before applying."
      : !review.versions
        ? "The function this form reviews no longer exists."
        : null;

  const assignWorkflowAction = async (templateId: string) => {
    "use server";
    await assignWorkflow(templateId, "form_submission", submissionId, eventId);
  };
  const removeWorkflowAction = async (instanceId: string) => {
    "use server";
    await removeWorkflow(instanceId, "form_submission", submissionId, eventId);
  };
  const toggleStepAction = async (instanceId: string, stepId: string) => {
    "use server";
    await toggleStepCompletion(instanceId, stepId, "form_submission", submissionId, eventId);
  };
  const toggleItemAction = async (instanceId: string, itemId: string) => {
    "use server";
    await toggleItemCompletion(instanceId, itemId, "form_submission", submissionId, eventId);
  };
  const applyAction = async (formData: FormData) => {
    "use server";
    await applyFormSubmission(eventId, submissionId, formData);
  };
  const rejectAction = async (formData: FormData) => {
    "use server";
    await rejectFormSubmission(eventId, submissionId, formData);
  };

  const contactRow = review.diff.find((s) => s.key === "contact")?.rows.find((r) => r.field === "contact");
  const title = `${FORM_TYPE_LABEL[submission.formType]} · ${review.targetName}`;
  const date = (d: Date | null) =>
    d ? d.toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-6 min-w-0">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Forms", href: `/events/${eventId}/forms` },
            { label: title },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white break-words">{title}</h1>
          {submission.state === "SUBMITTED" ? (
            <>
              <EntityStatusBadge status={submission.status ?? null} substatus={submission.substatus ?? null} />
              <WorkflowStatusBadge summary={computeWorkflowBadgeSummary(workflowInstances)} />
            </>
          ) : (
            <span className="text-sm text-gray-600 dark:text-gray-400">{FORM_STATE_LABEL[submission.state]}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-w-0 space-y-6">
          {submission.state === "SUBMITTED" && canWrite ? (
            <FormReview
              sections={review.diff}
              versions={review.versions}
              contact={
                contactRow?.proposed
                  ? {
                      proposed: contactRow.proposed,
                      matches: review.contactMatches.map((m) => ({
                        id: m.id,
                        label: [[m.firstName, m.lastName].filter(Boolean).join(" "), m.organization].filter(Boolean).join(", "),
                      })),
                    }
                  : null
              }
              approvalMessage={approvalMessage}
              apply={applyAction}
              reject={rejectAction}
            />
          ) : (
            <>
              <FormDiff sections={review.diff} selectable={false} />
              {submission.state !== "SUBMITTED" && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {FORM_STATE_LABEL[submission.state]} {date(submission.handledAt)}
                  {submission.handledBy && ` by ${submission.handledBy.name ?? submission.handledBy.email}`}
                  {submission.reviewNotes && <span className="block mt-1 whitespace-pre-line">{submission.reviewNotes}</span>}
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white">Submitted by</h2>
            <p className="text-gray-800 dark:text-gray-200">
              {submission.submitterName ?? "Unnamed"}
              {submission.submitterOrg && <span className="text-gray-600 dark:text-gray-400">, {submission.submitterOrg}</span>}
            </p>
            {submission.submitterEmail && <p className="text-gray-600 dark:text-gray-400 break-all">{submission.submitterEmail}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Unverified — anyone with the link can submit.
              {submission.formLink.recipientName && ` Sent to ${submission.formLink.recipientName}.`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{date(submission.submittedAt)}</p>
            {review.functionId && (
              <Link href={`/events/${eventId}/functions/${review.functionId}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Open function
              </Link>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Attachments</h2>
            {submission.files.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">None.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {submission.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                      <a href={`/api/files/${f.id}`} className="min-w-0 truncate text-blue-600 dark:text-blue-400 hover:underline">{f.fileName}</a>
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{formatFileSize(f.fileSize)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-700 dark:text-amber-300">Public upload — unverified. Applying files them on the event&apos;s Files.</p>
              </>
            )}
          </section>

          <WorkflowPanel
            entityType="form_submission"
            instances={workflowInstances}
            availableTemplates={availableWorkflowTemplates}
            entityStatus={submission.status ?? null}
            assignWorkflow={assignWorkflowAction}
            removeWorkflow={removeWorkflowAction}
            toggleStep={toggleStepAction}
            toggleItem={toggleItemAction}
          />
        </div>
      </div>
    </>
  );
}
