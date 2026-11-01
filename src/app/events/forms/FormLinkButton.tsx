"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { FORM_TYPE_LABEL, formLinkStatus } from "@/lib/forms/meta";
import type { FormType } from "@prisma/client";
import { formatFunctionLabel, matchesFunctionQuery } from "@/lib/functionNumbers";
import { CopyFormLink, DeleteFormLink, RevokeFormLink } from "./FormLinkActions";
import { syncRangeEnd } from "@/lib/dateRange";
import { isUserError, type UserError, actionErrorMessage } from "@/lib/userErrors";
import { keepFormValues } from "@/lib/keepFormValues";

const inputCls =
  "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

// Every entry page mounts the same trigger; self-start keeps it from
// stretching in a stacked mobile header.
export const formLinkTriggerCls = `${btnSecondary} self-start sm:self-auto whitespace-nowrap`;

// "Send to" values besides a contact id.
const OTHER = "__other__";
const ANYONE = "__anyone__";

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

type Recipient = { contactId: string; name: string; email: string | null };

export type FunctionPickerOption = {
  id: string;
  name: string;
  functionNumber: string | null;
  breakoutGroup: { name: string } | null;
  contacts: Recipient[];
};

type SectionList = readonly { key: string; label: string }[];

// A second form for the same target, offered as "Also send …"; both go out
// as one bundle link.
export type CompanionForm = {
  formType: FormType;
  sections: SectionList;
  externalUpload?: boolean;
  requireRecipient?: boolean;
};

type Props = {
  title: string;
  formType: FormType;
  companion?: CompanionForm;
  // Single-recipient forms post their target; open forms have none.
  targetField?: { name: string; value: string };
  // A Function Review picks one or more functions; their contacts become the
  // recipients. Replaces targetField.
  functionPicker?: { options: FunctionPickerOption[]; initial: string[] };
  // Omitted for a form with one section.
  sections?: SectionList;
  recipients?: Recipient[];
  // An optional scope picked in the dialog (an exhibit request's booth group).
  targetSelect?: { name: string; label: string; emptyLabel: string; options: { value: string; label: string }[] };
  // A form type's own link settings (posted as opt_* fields).
  extraFields?: React.ReactNode;
  // Offer a staff-hosted upload folder in place of uploads through the form.
  externalUpload?: boolean;
  // The link must name one of `recipients` (a speaker form is about them).
  requireRecipient?: boolean;
  // Targeted links default to one person; open links to anyone with the link.
  defaultAnyone?: boolean;
  // Open links default to unlimited responses.
  defaultMaxSubmissions?: number | null;
  workflowTemplates: { id: string; name: string }[];
  links: FormLinkSummary[];
  emailEnabled: boolean;
  defaultCloseDate: string;
  create: (formData: FormData) => Promise<{ token: string; emailed: boolean } | UserError>;
  revoke: (linkId: string) => Promise<void>;
  deleteLink: (linkId: string) => Promise<void | UserError>;
};

function uniqueRecipients(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return list.filter((r) => (seen.has(r.contactId) ? false : (seen.add(r.contactId), true)));
}

export function FormLinkButton({
  title,
  formType,
  companion,
  targetField,
  functionPicker,
  sections = [],
  recipients: fixedRecipients = [],
  defaultMaxSubmissions = 1,
  targetSelect,
  extraFields,
  requireRecipient: baseRequiresRecipient = false,
  defaultAnyone = false,
  externalUpload: baseExternalUpload = false,
  workflowTemplates,
  links,
  emailEnabled,
  defaultCloseDate,
  create,
  revoke,
  deleteLink,
}: Props) {
  const canWrite = useCanWrite("FORMS");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; emailed: boolean } | null>(null);
  const [functionIds, setFunctionIds] = useState<string[]>(functionPicker?.initial ?? []);
  const [functionQuery, setFunctionQuery] = useState("");
  const recipients = functionPicker
    ? uniqueRecipients(functionPicker.options.filter((f) => functionIds.includes(f.id)).flatMap((f) => f.contacts))
    : fixedRecipients;
  const first = recipients[0];
  const [sendTo, setSendTo] = useState<string>(first ? first.contactId : defaultAnyone ? ANYONE : OTHER);
  const [person, setPerson] = useState<{ name: string; email: string }>({ name: first?.name ?? "", email: first?.email ?? "" });
  const [withCompanion, setWithCompanion] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!canWrite || (baseRequiresRecipient && fixedRecipients.length === 0)) return null;

  const companionOn = !!companion && withCompanion;
  const requireRecipient = baseRequiresRecipient || (companionOn && !!companion.requireRecipient);
  const externalUpload = baseExternalUpload || (companionOn && !!companion.externalUpload);
  const sectionGroups: { label: string; sections: SectionList }[] = [
    { label: companionOn ? FORM_TYPE_LABEL[formType] : "Sections", sections },
    ...(companionOn ? [{ label: FORM_TYPE_LABEL[companion.formType], sections: companion.sections }] : []),
  ].filter((g) => g.sections.length > 0);

  // A contact dropped from the picked functions falls back to "someone else",
  // keeping the typed name and email.
  const contact = recipients.find((r) => r.contactId === sendTo);
  const choice = contact ? sendTo : sendTo === ANYONE && !requireRecipient ? ANYONE : OTHER;
  const anyone = choice === ANYONE;

  const pickSendTo = (value: string) => {
    setSendTo(value);
    const r = recipients.find((x) => x.contactId === value);
    if (r) setPerson({ name: r.name, email: r.email ?? "" });
    else if (value === OTHER) setPerson({ name: "", email: "" });
  };

  const close = () => {
    setOpen(false);
    setCreated(null);
    setError(null);
  };

  // YYYY-MM-DD in the browser's zone; the dialog only renders after a click.
  const today = new Date().toLocaleDateString("en-CA");

  const visibleFunctions = functionPicker
    ? functionPicker.options.filter((f) => functionIds.includes(f.id) || matchesFunctionQuery(f, functionQuery))
    : [];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={formLinkTriggerCls}>
        {title}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
              <button type="button" onClick={close} aria-label="Close" className="text-xl leading-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                &times;
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
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
                  onReset={keepFormValues}
                  className="space-y-4"
                  action={(formData) =>
                    startTransition(async () => {
                      setError(null);
                      try {
                        const result = await create(formData);
                        if (isUserError(result)) {
                          setError(result.error);
                          return;
                        }
                        setCreated(result);
                        router.refresh();
                      } catch (e) {
                        setError(actionErrorMessage(e, "Couldn't create the link"));
                      }
                    })
                  }
                >
                  <input type="hidden" name="formType" value={formType} />
                  {targetField && <input type="hidden" name={targetField.name} value={targetField.value} />}
                  <input type="hidden" name="audience" value={anyone ? "anyone" : "specific"} />
                  {contact && <input type="hidden" name="contactId" value={contact.contactId} />}
                  {functionPicker && (
                    <fieldset>
                      <legend className={labelCls}>
                        Functions{functionIds.length > 1 ? ` (${functionIds.length})` : ""}
                      </legend>
                      {functionPicker.options.length > 8 && (
                        <input
                          type="search"
                          value={functionQuery}
                          onChange={(e) => setFunctionQuery(e.target.value)}
                          placeholder="Filter functions"
                          className={`${inputCls} mb-2`}
                        />
                      )}
                      <div className="max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                        {visibleFunctions.map((f) => (
                          <label key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200">
                            <input
                              type="checkbox"
                              name="functionIds"
                              value={f.id}
                              checked={functionIds.includes(f.id)}
                              onChange={(e) =>
                                setFunctionIds(e.target.checked ? [...functionIds, f.id] : functionIds.filter((id) => id !== f.id))
                              }
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="min-w-0 truncate">{formatFunctionLabel(f)}</span>
                          </label>
                        ))}
                        {visibleFunctions.length === 0 && (
                          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No matching functions.</p>
                        )}
                      </div>
                    </fieldset>
                  )}
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
                  <div>
                    <label className={labelCls}>Send to</label>
                    <select value={choice} onChange={(e) => pickSendTo(e.target.value)} className={inputCls}>
                      {recipients.map((r) => (
                        <option key={r.contactId} value={r.contactId}>{r.email ? `${r.name} · ${r.email}` : r.name}</option>
                      ))}
                      {!requireRecipient && <option value={OTHER}>{recipients.length ? "Someone else" : "A specific person"}</option>}
                      {!requireRecipient && <option value={ANYONE}>Anyone with the link</option>}
                    </select>
                  </div>
                  {!anyone && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Name</label>
                        <input name="recipientName" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <input name="recipientEmail" type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} className={inputCls} />
                      </div>
                    </div>
                  )}
                  {companion && (
                    <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="checkbox"
                        name="alsoFormTypes"
                        value={companion.formType}
                        checked={withCompanion}
                        disabled={!!companion.requireRecipient && fixedRecipients.length === 0}
                        onChange={(e) => {
                          setWithCompanion(e.target.checked);
                          // A form about the speaker needs one picked.
                          if (e.target.checked && companion.requireRecipient && !contact && recipients[0]) pickSendTo(recipients[0].contactId);
                        }}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      Also request {FORM_TYPE_LABEL[companion.formType].toLowerCase()}
                    </label>
                  )}
                  {sectionGroups.map((g) => (
                    <fieldset key={g.label}>
                      <legend className={labelCls}>{g.label}</legend>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {g.sections.map((sec) => (
                          <label key={sec.key} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                            <input type="checkbox" name="sections" value={sec.key} defaultChecked className="rounded border-gray-300 dark:border-gray-600" />
                            {sec.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  {extraFields}
                  {externalUpload && (
                    <div>
                      <label className={labelCls}>Media upload link</label>
                      <input name="mediaUploadUrl" type="url" pattern="https://.*" maxLength={500} placeholder="https://" className={inputCls} />
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Message</label>
                    <textarea name="intro" rows={2} maxLength={2000} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Respond by</label>
                      <input name="dueAt" type="date" min={today} onChange={(e) => syncRangeEnd(e.currentTarget, "expiresAt")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Closes</label>
                      <input name="expiresAt" type="date" required min={today} defaultValue={defaultCloseDate} className={inputCls} />
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
                  {emailEnabled && !anyone && (
                    <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                      <input type="checkbox" name="sendEmail" value="true" disabled={!person.email} className="rounded border-gray-300 dark:border-gray-600" />
                      Email the link to {person.name || "them"}
                    </label>
                  )}
                  {error && (
                    <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={close} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                      Cancel
                    </button>
                    <button type="submit" disabled={isPending || (!!functionPicker && functionIds.length === 0)} className={`${btnPrimary} disabled:opacity-50`}>
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
                            {l.label || l.recipientName || "Anyone with the link"} <span className={`text-xs ${status.cls}`}>{status.label}</span>
                          </span>
                          <span className="flex gap-3">
                            {l.revokedAt ? (
                              <DeleteFormLink deleteLink={() => deleteLink(l.id)} />
                            ) : (
                              <>
                                <CopyFormLink token={l.token} />
                                <RevokeFormLink revoke={() => revoke(l.id)} />
                              </>
                            )}
                          </span>
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
