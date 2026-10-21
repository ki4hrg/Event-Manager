"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formLinkStatus } from "@/lib/forms/meta";
import { CopyFormLink, RevokeFormLink } from "./FormLinkActions";

const inputCls =
  "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

export type FormLinkSummary = {
  id: string;
  token: string;
  label: string | null;
  recipientName: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  maxSubmissions: number | null;
  submittedCount: number;
};

type Props = {
  title: string;
  formType: string;
  // Single-recipient forms post their target; open forms have none.
  targetField?: { name: string; value: string };
  // Omitted for a form with one section.
  sections?: readonly { key: string; label: string }[];
  recipients?: { contactId: string; name: string; email: string | null }[];
  // An optional scope picked in the dialog (an exhibit request's booth group).
  targetSelect?: { name: string; label: string; emptyLabel: string; options: { value: string; label: string }[] };
  // The link must name one of `recipients` (a speaker form is about them).
  requireRecipient?: boolean;
  // Open links default to unlimited responses.
  defaultMaxSubmissions?: number | null;
  workflowTemplates: { id: string; name: string }[];
  links: FormLinkSummary[];
  emailEnabled: boolean;
  defaultCloseDate: string;
  create: (formData: FormData) => Promise<{ token: string; emailed: boolean }>;
  revoke: (linkId: string) => Promise<void>;
};

export function FormLinkButton({
  title,
  formType,
  targetField,
  sections = [],
  recipients = [],
  defaultMaxSubmissions = 1,
  targetSelect,
  requireRecipient = false,
  workflowTemplates,
  links,
  emailEnabled,
  defaultCloseDate,
  create,
  revoke,
}: Props) {
  const canWrite = useCanWrite("FORMS");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; emailed: boolean } | null>(null);
  const first = requireRecipient ? recipients[0] : undefined;
  const [recipient, setRecipient] = useState<{ contactId: string; name: string; email: string }>(
    first ? { contactId: first.contactId, name: first.name, email: first.email ?? "" } : { contactId: "", name: "", email: "" },
  );
  const [isPending, startTransition] = useTransition();

  if (!canWrite || (requireRecipient && recipients.length === 0)) return null;

  const close = () => {
    setOpen(false);
    setCreated(null);
    setError(null);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
        {title}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
              <button type="button" onClick={close} className="text-xl leading-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                &times;
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {error && (
                <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
              )}
              {created ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    Link created{created.emailed ? " and emailed" : ""}.
                  </p>
                  <p className="break-all rounded bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {typeof window !== "undefined" ? `${window.location.origin}/f/${created.token}` : `/f/${created.token}`}
                  </p>
                  <div className="flex justify-end gap-3">
                    <CopyFormLink token={created.token} />
                    <button type="button" onClick={close} className={btnPrimary}>Done</button>
                  </div>
                </div>
              ) : (
                <form
                  className="space-y-4"
                  action={(formData) =>
                    startTransition(async () => {
                      setError(null);
                      try {
                        setCreated(await create(formData));
                        router.refresh();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Couldn't create the link");
                      }
                    })
                  }
                >
                  <input type="hidden" name="formType" value={formType} />
                  {targetField && <input type="hidden" name={targetField.name} value={targetField.value} />}
                  <input type="hidden" name="contactId" value={recipient.contactId} />
                  {targetSelect && targetSelect.options.length > 0 && (
                    <div>
                      <label className={labelCls}>{targetSelect.label}</label>
                      <select name={targetSelect.name} defaultValue="" className={inputCls}>
                        <option value="">{targetSelect.emptyLabel}</option>
                        {targetSelect.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {recipients.length > 0 && (
                    <div>
                      <label className={labelCls}>Send to</label>
                      <select
                        value={recipient.contactId}
                        onChange={(e) => {
                          const r = recipients.find((x) => x.contactId === e.target.value);
                          setRecipient(r ? { contactId: r.contactId, name: r.name, email: r.email ?? "" } : { contactId: "", name: "", email: "" });
                        }}
                        className={inputCls}
                      >
                        {!requireRecipient && <option value="">Someone else</option>}
                        {recipients.map((r) => (
                          <option key={r.contactId} value={r.contactId}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Recipient name</label>
                      <input name="recipientName" value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Recipient email</label>
                      <input name="recipientEmail" type="email" value={recipient.email} onChange={(e) => setRecipient({ ...recipient, email: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  {sections.length > 0 && (
                  <fieldset>
                    <legend className={labelCls}>Sections</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {sections.map((s) => (
                        <label key={s.key} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                          <input type="checkbox" name="sections" value={s.key} defaultChecked className="rounded border-gray-300 dark:border-gray-600" />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  )}
                  <div>
                    <label className={labelCls}>Message</label>
                    <textarea name="intro" rows={2} maxLength={2000} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Respond by</label>
                      <input name="dueAt" type="date" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Closes</label>
                      <input name="expiresAt" type="date" required defaultValue={defaultCloseDate} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Responses allowed</label>
                      <input name="maxSubmissions" type="number" min={1} max={1000} defaultValue={defaultMaxSubmissions ?? ""} placeholder="No limit" className={inputCls} />
                    </div>
                  </div>
                  {workflowTemplates.length > 0 && (
                    <div>
                      <label className={labelCls}>Approval workflow</label>
                      <select name="workflowTemplateId" defaultValue="" className={inputCls}>
                        <option value="">None</option>
                        {workflowTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Label</label>
                    <input name="label" maxLength={120} className={inputCls} />
                  </div>
                  {emailEnabled && (
                    <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                      <input type="checkbox" name="sendEmail" value="true" disabled={!recipient.email} className="rounded border-gray-300 dark:border-gray-600" />
                      Email the link to the recipient
                    </label>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={close} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                      Cancel
                    </button>
                    <button type="submit" disabled={isPending} className={`${btnPrimary} disabled:opacity-50`}>
                      {isPending ? "Creating…" : "Create link"}
                    </button>
                  </div>
                </form>
              )}

              {!created && links.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className={labelCls}>Existing links</p>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {links.map((l) => {
                      const status = formLinkStatus(l);
                      return (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                            {l.label || l.recipientName || "Untitled"} <span className={`text-xs ${status.cls}`}>{status.label}</span>
                          </span>
                          {!l.revokedAt && (
                            <span className="flex gap-3">
                              <CopyFormLink token={l.token} />
                              <RevokeFormLink revoke={() => revoke(l.id)} />
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
