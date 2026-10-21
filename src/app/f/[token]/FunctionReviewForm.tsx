"use client";

import { useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatFileSize } from "@/lib/uploads";
import {
  FORM_ERROR_COPY,
  functionReviewSectionLabel,
  type FunctionReviewBaseline,
  type FunctionReviewPayload,
  type FunctionReviewSection,
} from "@/lib/forms/meta";
import { discardFormDraft, removeFormDraftFile, saveFormDraft, submitForm } from "./actions";

const inputCls =
  "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const mutedCls = "text-sm text-gray-600 dark:text-gray-400";

type DraftView = {
  payload: FunctionReviewPayload | null;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterOrg: string | null;
  files: { id: string; fileName: string; fileSize: number }[];
  savedAt: string;
};

type Props = {
  token: string;
  version: string;
  baseline: FunctionReviewBaseline;
  sections: FunctionReviewSection[];
  setupTypes: string[];
  draft: DraftView | null;
  recipientName: string | null;
  errorMessage: string | null;
  saved: boolean;
};

function FormButtons({ token }: { token: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
        {pending ? "Sending…" : "Submit"}
      </button>
      <button
        type="submit"
        formAction={saveFormDraft.bind(null, token)}
        formNoValidate
        disabled={pending}
        className={`${btnSecondary} disabled:opacity-50`}
      >
        Save progress
      </button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

function OnFile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</div>
    </div>
  );
}

function Verdict({ section, payload }: { section: FunctionReviewSection; payload: FunctionReviewPayload | null }) {
  const response = payload?.responses?.[section];
  const [verdict, setVerdict] = useState<string>(response?.verdict ?? "");
  return (
    <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
      <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={`${functionReviewSectionLabel(section)} review`}>
        {[
          { value: "ok", label: "Looks right" },
          { value: "changes", label: "Needs changes" },
        ].map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
            <input
              type="radio"
              name={`r_${section}_verdict`}
              value={o.value}
              checked={verdict === o.value}
              onChange={() => setVerdict(o.value)}
              className="border-gray-300 dark:border-gray-600"
            />
            {o.label}
          </label>
        ))}
      </div>
      {verdict === "changes" ? (
        <div>
          <label htmlFor={`r_${section}_note`} className={labelCls}>What needs to change?</label>
          <textarea
            id={`r_${section}_note`}
            name={`r_${section}_note`}
            rows={3}
            maxLength={2000}
            defaultValue={response?.note ?? ""}
            className={inputCls}
          />
        </div>
      ) : (
        <input type="hidden" name={`r_${section}_note`} value={response?.note ?? ""} />
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={`${mutedCls} italic`}>{children}</p>;
}

function Files({ token, files }: { token: string; files: DraftView["files"] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/f/${token}/upload`, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(FORM_ERROR_COPY[data.error ?? "upload"] ?? FORM_ERROR_COPY.upload);
        return;
      }
      router.refresh();
    } catch {
      setError(FORM_ERROR_COPY.upload);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card title="Attachments">
      {files.length > 0 ? (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm text-gray-900 dark:text-gray-100">{f.fileName}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(f.fileSize)}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeFormDraftFile(token, f.id);
                      router.refresh();
                    })
                  }
                  className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No files attached.</Empty>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div>
        <label htmlFor="form-upload" className={labelCls}>Add a file (PDF, image, Word, Excel or PowerPoint; up to 20 MB)</label>
        <input
          id="form-upload"
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.pptx"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:rounded file:border-0 file:bg-gray-100 dark:file:bg-gray-800 file:px-3 file:py-1.5 file:text-sm file:text-gray-700 dark:file:text-gray-200"
        />
        {uploading && <p className={`${mutedCls} mt-1`}>Uploading…</p>}
      </div>
    </Card>
  );
}

function DiscardDraft({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        Discard draft
      </button>
    );
  }
  return (
    <span className="flex items-center gap-3 text-sm">
      <span className="text-gray-700 dark:text-gray-300">Discard your saved answers and files?</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => discardFormDraft(token))}
        className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
      >
        Discard
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-gray-500 dark:text-gray-400 hover:underline">
        Keep
      </button>
    </span>
  );
}

export function FunctionReviewForm({
  token,
  version,
  baseline,
  sections,
  setupTypes,
  draft,
  recipientName,
  errorMessage,
  saved,
}: Props) {
  const p = draft?.payload ?? null;
  // A field the draft holds wins; otherwise what's on file.
  const val = <K extends keyof FunctionReviewPayload>(key: K, fallback: string | number | null) => {
    const v = p?.[key];
    return v === undefined ? (fallback ?? "") : ((v as string | number | null) ?? "");
  };
  const on = new Set(sections);

  return (
    <form action={submitForm.bind(null, token)} className="space-y-6">
      <input type="hidden" name="version" value={version} />
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {errorMessage && (
        <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}
      {saved && (
        <div className="rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          Progress saved on this device.
        </div>
      )}

      <Card title="Your details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="submitterName" className={labelCls}>Name</label>
            <input id="submitterName" name="submitterName" required maxLength={120} defaultValue={draft?.submitterName ?? recipientName ?? ""} className={inputCls} />
          </div>
          <div>
            <label htmlFor="submitterOrg" className={labelCls}>Organization</label>
            <input id="submitterOrg" name="submitterOrg" maxLength={120} defaultValue={draft?.submitterOrg ?? ""} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="submitterEmail" className={labelCls}>Email</label>
            <input id="submitterEmail" name="submitterEmail" type="email" maxLength={200} defaultValue={draft?.submitterEmail ?? ""} className={inputCls} />
          </div>
        </div>
      </Card>

      {on.has("overview") && (
        <Card title={functionReviewSectionLabel("overview")}>
          <OnFile label="Rooms">{baseline.rooms.length ? baseline.rooms.join(", ") : <Empty>No room assigned yet.</Empty>}</OnFile>
          <div>
            <label htmlFor="description" className={labelCls}>Description</label>
            <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={val("description", baseline.description)} className={inputCls} />
          </div>
          <div className="sm:w-48">
            <label htmlFor="expectedAttendance" className={labelCls}>Expected attendance</label>
            <input id="expectedAttendance" name="expectedAttendance" type="number" min={0} max={100000} inputMode="numeric" defaultValue={val("expectedAttendance", baseline.expectedAttendance)} className={inputCls} />
          </div>
          <Verdict section="overview" payload={p} />
        </Card>
      )}

      {on.has("schedule") && (
        <Card title={functionReviewSectionLabel("schedule")}>
          {baseline.schedules.length ? (
            <ul className="space-y-1">
              {baseline.schedules.map((s, i) => (
                <li key={i} className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-medium">{s.type}</span> <span className="text-gray-600 dark:text-gray-400">· {s.time}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No times scheduled yet.</Empty>
          )}
          <Verdict section="schedule" payload={p} />
        </Card>
      )}

      {on.has("setup") && (
        <Card title={functionReviewSectionLabel("setup")}>
          <div className="sm:w-72">
            <label htmlFor="defaultSetup" className={labelCls}>Setup style</label>
            <select id="defaultSetup" name="defaultSetup" defaultValue={val("defaultSetup", baseline.defaultSetup)} className={inputCls}>
              <option value="">Not set</option>
              {setupTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {baseline.setup.map((s, i) => (
            <OnFile key={i} label={s.order}>
              {s.setupType && <p>{s.setupType}</p>}
              {s.tables.map((t, j) => <p key={j} className="text-gray-600 dark:text-gray-400">{t}</p>)}
            </OnFile>
          ))}
          <Verdict section="setup" payload={p} />
        </Card>
      )}

      {on.has("catering") && baseline.catering && (
        <Card title={functionReviewSectionLabel("catering")}>
          {(baseline.catering.mealType || baseline.catering.serviceStyle) && (
            <OnFile label="Service">{[baseline.catering.mealType, baseline.catering.serviceStyle].filter(Boolean).join(" · ")}</OnFile>
          )}
          <div className="sm:w-48">
            <label htmlFor="cateringExpectedCount" className={labelCls}>Expected count</label>
            <input id="cateringExpectedCount" name="cateringExpectedCount" type="number" min={0} max={100000} inputMode="numeric" defaultValue={val("cateringExpectedCount", baseline.catering.expectedCount)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="dietaryNotes" className={labelCls}>Dietary needs</label>
            <textarea id="dietaryNotes" name="dietaryNotes" rows={3} maxLength={2000} defaultValue={val("dietaryNotes", baseline.catering.dietaryNotes)} className={inputCls} />
          </div>
          <Verdict section="catering" payload={p} />
        </Card>
      )}

      {on.has("av") && (
        <Card title={functionReviewSectionLabel("av")}>
          {baseline.av.length ? (
            baseline.av.map((o, i) => (
              <OnFile key={i} label={o.order}>
                {o.items.length ? (
                  <ul>{o.items.map((it, j) => <li key={j}>{it.quantity != null ? `${it.quantity} × ` : ""}{it.item}</li>)}</ul>
                ) : (
                  <Empty>No equipment listed.</Empty>
                )}
              </OnFile>
            ))
          ) : (
            <Empty>No audio visual planned yet.</Empty>
          )}
          <Verdict section="av" payload={p} />
        </Card>
      )}

      {on.has("materials") && (
        <Card title={functionReviewSectionLabel("materials")}>
          {baseline.materials.length ? (
            baseline.materials.map((o, i) => (
              <OnFile key={i} label={o.order}>
                {o.items.length ? (
                  <ul>{o.items.map((it, j) => <li key={j}>{it.quantity != null ? `${it.quantity} × ` : ""}{it.description}</li>)}</ul>
                ) : (
                  <Empty>No items listed.</Empty>
                )}
              </OnFile>
            ))
          ) : (
            <Empty>No printed materials or supplies planned yet.</Empty>
          )}
          <Verdict section="materials" payload={p} />
        </Card>
      )}

      {on.has("signage") && (
        <Card title={functionReviewSectionLabel("signage")}>
          <div>
            <label htmlFor="signageNotes" className={labelCls}>Signage</label>
            <textarea id="signageNotes" name="signageNotes" rows={3} maxLength={2000} defaultValue={val("signageNotes", baseline.signageNotes)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="decorNotes" className={labelCls}>Decor</label>
            <textarea id="decorNotes" name="decorNotes" rows={3} maxLength={2000} defaultValue={val("decorNotes", baseline.decorNotes)} className={inputCls} />
          </div>
          <Verdict section="signage" payload={p} />
        </Card>
      )}

      {on.has("contact") && (
        <Card title={functionReviewSectionLabel("contact")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contactFirstName" className={labelCls}>First name</label>
              <input id="contactFirstName" name="contactFirstName" maxLength={120} defaultValue={p?.contact?.firstName ?? ""} className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactLastName" className={labelCls}>Last name</label>
              <input id="contactLastName" name="contactLastName" maxLength={120} defaultValue={p?.contact?.lastName ?? ""} className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactEmail" className={labelCls}>Email</label>
              <input id="contactEmail" name="contactEmail" type="email" maxLength={200} defaultValue={p?.contact?.email ?? ""} className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactPhone" className={labelCls}>Mobile phone</label>
              <input id="contactPhone" name="contactPhone" type="tel" maxLength={40} defaultValue={p?.contact?.phone ?? ""} className={inputCls} />
            </div>
          </div>
          <Verdict section="contact" payload={p} />
        </Card>
      )}

      <Files token={token} files={draft?.files ?? []} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FormButtons token={token} />
        {draft && <DiscardDraft token={token} />}
      </div>
    </form>
  );
}
