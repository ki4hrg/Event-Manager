"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { PermissionResource, RfpKind, RfpStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { RichTextEditor } from "@/components/RichTextEditor";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatDateKey } from "@/lib/hotels";
import { RFP_STATUS_LABELS, sectionsFor } from "@/lib/rfp/sections";

export type RfpValues = {
  title: string;
  status: RfpStatus;
  responseDue: string | null;
  decisionBy: string | null;
  sections: string[];
  introduction: string | null;
  requirements: string | null;
  contactId: string | null;
  contactName: string | null;
  showRoomNames: boolean;
  excludedFunctionTypes: string[];
};

export type RfpFormChoices = {
  contacts: { id: string; label: string }[];
  functionTypes: string[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const checkClass = "rounded border-gray-300 dark:border-gray-600";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : label}
    </button>
  );
}

function Field({ label, htmlFor, wide, children }: { label: string; htmlFor: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function RfpForm({
  kind,
  resource,
  values,
  choices,
  action,
  cancelHref,
  hiddenFields,
}: {
  kind: RfpKind;
  resource: PermissionResource;
  values: RfpValues;
  choices: RfpFormChoices;
  action: (formData: FormData) => Promise<void>;
  // Set on create only; an edit form toggles back to view mode instead.
  cancelHref?: string;
  // Extra payload for create (e.g. blocks filled from history).
  hiddenFields?: Record<string, string>;
}) {
  const isEdit = !cancelHref;
  const canWrite = useCanWrite(resource);
  const [editing, setEditing] = useState(!isEdit);
  const [sections, setSections] = useState(new Set(values.sections));
  const parts = sectionsFor(kind);

  if (!editing || !canWrite) {
    const rows: [string, ReactNode][] = [
      ["Status", RFP_STATUS_LABELS[values.status]],
      ["Responses due", formatDateKey(values.responseDue)],
      ["Decision by", formatDateKey(values.decisionBy)],
      ["Contact", values.contactName ?? "—"],
      ["Parts", parts.filter((p) => sections.has(p.key)).map((p) => p.label).join(", ") || "—"],
    ];
    if (sections.has("meetingSpace") && values.excludedFunctionTypes.length) rows.push(["Meeting space leaves out", values.excludedFunctionTypes.join(", ")]);
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Details</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="text-gray-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const toggle = (key: string, on: boolean) =>
    setSections((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
      className={`${cardClass} space-y-6`}
    >
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Title *" htmlFor="rfp-title" wide>
          <input id="rfp-title" name="title" required defaultValue={values.title} className={inputClass} />
        </Field>
        {isEdit && (
          <Field label="Status" htmlFor="rfp-status">
            <select id="rfp-status" name="status" defaultValue={values.status} className={inputClass}>
              {(Object.keys(RFP_STATUS_LABELS) as RfpStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RFP_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Contact" htmlFor="rfp-contactId">
          <select id="rfp-contactId" name="contactId" defaultValue={values.contactId ?? ""} className={inputClass}>
            <option value="">None</option>
            {values.contactId && !choices.contacts.some((c) => c.id === values.contactId) && (
              <option value={values.contactId}>{values.contactName}</option>
            )}
            {choices.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responses due" htmlFor="rfp-responseDue">
          <input id="rfp-responseDue" type="date" name="responseDue" defaultValue={values.responseDue ?? ""} className={inputClass} />
        </Field>
        <Field label="Decision by" htmlFor="rfp-decisionBy">
          <input id="rfp-decisionBy" type="date" name="decisionBy" defaultValue={values.decisionBy ?? ""} className={inputClass} />
        </Field>
      </div>

      <div>
        <p className={labelClass}>Parts</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
          {parts.map((p) => (
            <label key={p.key} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                name="sections"
                value={p.key}
                checked={sections.has(p.key)}
                onChange={(e) => toggle(p.key, e.target.checked)}
                className={checkClass}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      {sections.has("meetingSpace") && (
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" name="showRoomNames" value="true" defaultChecked={values.showRoomNames} className={checkClass} />
            Show room names
          </label>
          {choices.functionTypes.length > 0 && (
            <div>
              <p className={labelClass}>Leave out of meeting space</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {Array.from(new Set([...choices.functionTypes, ...values.excludedFunctionTypes])).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      name="excludedFunctionTypes"
                      value={t}
                      defaultChecked={values.excludedFunctionTypes.includes(t)}
                      className={checkClass}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!sections.has("meetingSpace") && (
        <>
          {values.showRoomNames && <input type="hidden" name="showRoomNames" value="true" />}
          {values.excludedFunctionTypes.map((t) => (
            <input key={t} type="hidden" name="excludedFunctionTypes" value={t} />
          ))}
        </>
      )}

      <div>
        <p className={labelClass}>Introduction</p>
        <div className="mt-1">
          <RichTextEditor name="introduction" defaultValue={values.introduction ?? ""} />
        </div>
      </div>
      {sections.has("requirements") ? (
        <div>
          <p className={labelClass}>Additional requirements</p>
          <div className="mt-1">
            <RichTextEditor name="requirements" defaultValue={values.requirements ?? ""} />
          </div>
        </div>
      ) : (
        <input type="hidden" name="requirements" value={values.requirements ?? ""} />
      )}

      <div className="flex flex-wrap gap-3">
        <SaveButton label={isEdit ? "Save" : "Create RFP"} />
        {isEdit ? (
          <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
            Cancel
          </button>
        ) : (
          <Link href={cancelHref!} className={btnSecondary}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
