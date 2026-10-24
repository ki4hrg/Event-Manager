import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { purgeStaleFormSubmissions } from "@/lib/forms/links";
import { FORM_STATE_LABEL, FORM_TYPE_LABEL, FUNCTION_REVIEW_SECTIONS, formLinkStatus } from "@/lib/forms/meta";
import { reportTd, reportTh } from "@/lib/reportStyles";
import { getEvent } from "@/app/events/event";
import { deleteFormLink, getFormLinks, getFormSubmissions, revokeFormLink, type SubmissionView } from "../../forms/actions";
import { CopyFormLink, DeleteFormLink, RevokeFormLink } from "../../forms/FormLinkActions";
import { FormLinkEntry } from "../../forms/FormLinkEntry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Forms" };

const TABS: { value: string; label: string }[] = [
  { value: "open", label: "To review" },
  { value: "done", label: "Done" },
  { value: "links", label: "Links" },
];

function formatDate(d: Date | null, timezone: string) {
  return d ? d.toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default async function FormsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: eventId } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.value === rawTab) ? rawTab! : "open";
  const event = await getEvent(eventId);
  if (!event) notFound();
  const timezone = event.timezone || "America/Chicago";
  purgeStaleFormSubmissions().catch(() => {});

  const [links, submissions] = await Promise.all([
    tab === "links" ? getFormLinks(eventId) : Promise.resolve([]),
    tab === "links" ? Promise.resolve([]) : getFormSubmissions(eventId, tab as SubmissionView),
  ]);

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "Forms" }]} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Forms</h1>
          <div className="flex flex-wrap gap-2">
            <FormLinkEntry eventId={eventId} formType="FUNCTION_REVIEW" title="Request review" sections={FUNCTION_REVIEW_SECTIONS} />
            <FormLinkEntry eventId={eventId} formType="ITEM_REQUEST" title="Item request link" />
            <FormLinkEntry eventId={eventId} formType="EXHIBIT_REQUEST" title="Exhibit request link" />
          </div>
        </div>
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/events/${eventId}/forms?tab=${t.value}`}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t.value
                ? "border-blue-600 text-blue-700 dark:text-blue-400"
                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "links" ? (
        links.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No form links yet.</p>
        ) : (
          <div className="max-w-6xl overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={reportTh}>Form</th>
                  <th className={reportTh}>For</th>
                  <th className={reportTh}>Recipient</th>
                  <th className={reportTh}>Responses</th>
                  <th className={reportTh}>Closes</th>
                  <th className={reportTh}>Status</th>
                  <th className={reportTh}></th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const status = formLinkStatus(l);
                  const revoke = async () => {
                    "use server";
                    await revokeFormLink(eventId, l.id);
                  };
                  const remove = async () => {
                    "use server";
                    return deleteFormLink(eventId, l.id);
                  };
                  // A bundle's targets are its links' targets.
                  const parts = l.bundle ? l.children : [l];
                  const types = Array.from(new Set(parts.map((p) => FORM_TYPE_LABEL[p.formType])));
                  const targets = Array.from(
                    new Map(
                      parts.flatMap((p) => [
                        ...(p.function ? [{ href: `/events/${eventId}/functions/${p.function.id}`, label: formatFunctionLabel(p.function) }] : []),
                        ...(p.presentation ? [{ href: `/events/${eventId}/presentations/${p.presentation.id}`, label: p.presentation.title }] : []),
                      ]).map((t) => [t.href, t]),
                    ).values(),
                  );
                  return (
                    <tr key={l.id}>
                      <td className={reportTd}>
                        {types.join(" & ")}
                        {l.label && <span className="block text-gray-500 dark:text-gray-400">{l.label}</span>}
                      </td>
                      <td className={reportTd}>
                        {targets.length === 0
                          ? "—"
                          : targets.map((t) => (
                              <Link key={t.href} href={t.href} className="block text-blue-600 dark:text-blue-400 hover:underline">
                                {t.label}
                              </Link>
                            ))}
                      </td>
                      <td className={reportTd}>
                        {l.recipientName ?? "Anyone with the link"}
                        {l.recipientEmail && <span className="block text-gray-500 dark:text-gray-400">{l.recipientEmail}</span>}
                      </td>
                      <td className={reportTd}>
                        {l.bundle ? (
                          `${l.children.filter((c) => c.submittedCount > 0).length} of ${l.children.length} forms`
                        ) : (
                          <>
                            {l.submittedCount}
                            {l.maxSubmissions != null && ` of ${l.maxSubmissions}`}
                          </>
                        )}
                        <span className="block text-gray-500 dark:text-gray-400">{l.accessCount} views</span>
                      </td>
                      <td className={reportTd}>
                        {formatDate(l.expiresAt, timezone)}
                        {l.dueAt && (
                          <span
                            className={`block ${
                              l.dueAt < new Date() && !l.revokedAt && (l.bundle ? l.children.some((c) => c.submittedCount === 0) : l.submittedCount === 0)
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            Due {formatDate(l.dueAt, timezone)}
                          </span>
                        )}
                      </td>
                      <td className={`${reportTd} ${status.cls}`}>{status.label}</td>
                      <td className={`${reportTd} whitespace-nowrap`}>
                        {l.revokedAt ? (
                          <DeleteFormLink deleteLink={remove} />
                        ) : (
                          <span className="flex gap-3">
                            <CopyFormLink token={l.token} />
                            <RevokeFormLink revoke={revoke} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : submissions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{tab === "open" ? "Nothing to review." : "No reviewed submissions yet."}</p>
      ) : (
        <div className="max-w-5xl space-y-2">
          {submissions.map((s) => (
            <Link
              key={s.id}
              href={`/events/${eventId}/forms/${s.id}`}
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {FORM_TYPE_LABEL[s.formType]}
                  {s.formLink.function && <span className="font-normal text-gray-600 dark:text-gray-400"> · {formatFunctionLabel(s.formLink.function)}</span>}
                  {s.formLink.presentation && <span className="font-normal text-gray-600 dark:text-gray-400"> · {s.formLink.presentation.title}</span>}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {[s.submitterName, s.submitterOrg].filter(Boolean).join(", ") || "Unnamed"} · {formatDate(s.submittedAt, timezone)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.state === "SUBMITTED" ? (
                  <EntityStatusBadge status={s.status ?? null} substatus={s.substatus ?? null} />
                ) : (
                  <span className="text-xs text-gray-600 dark:text-gray-400">{FORM_STATE_LABEL[s.state]}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
