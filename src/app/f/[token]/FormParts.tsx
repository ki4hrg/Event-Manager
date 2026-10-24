"use client";

// Pieces every public form shares: the frame (version, honeypot, banners,
// submitter details, attachments, buttons) and small layout helpers.

import { useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatFileSize } from "@/lib/uploads";
import { FORM_ERROR_COPY, HONEYPOT_FIELD } from "@/lib/forms/meta";
import { discardFormDraft, removeFormDraftFile, saveFormDraft, submitForm } from "./actions";

export const inputCls =
  "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
export const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
export const mutedCls = "text-sm text-gray-600 dark:text-gray-400";

export type DraftFile = { id: string; fileName: string; fileSize: number };

export type DraftView<P> = {
  payload: P | null;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterOrg: string | null;
  files: DraftFile[];
};

// What the page hands every form component besides its own data.
export type CommonFormProps = {
  token: string;
  version: string;
  // The baseline this page rendered against, posted back so a stale submit
  // can keep the answers as a draft over it.
  baselineJson: string;
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

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

export function OnFile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className={`${mutedCls} italic`}>{children}</p>;
}

function Files({ token, files }: { token: string; files: DraftFile[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  // One request per file, in order; stops at the first refusal.
  async function upload(files: File[]) {
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch(`/f/${token}/upload`, { method: "POST", body });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(`${file.name}: ${FORM_ERROR_COPY[data.error ?? "upload"] ?? FORM_ERROR_COPY.upload}`);
          break;
        }
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
        <label htmlFor="form-upload" className={labelCls}>Add files (PDF, image, Word, Excel or PowerPoint; up to 20 MB each)</label>
        <input
          id="form-upload"
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.pptx"
          disabled={uploading}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) upload(files);
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

export function FormFrame({
  token,
  version,
  baselineJson,
  recipientName,
  errorMessage,
  saved,
  draft,
  orgLabel = "Organization",
  allowUploads = true,
  children,
}: CommonFormProps & {
  draft: Omit<DraftView<unknown>, "payload"> | null;
  orgLabel?: string;
  // Off when staff host the uploads elsewhere (a link's mediaUploadUrl).
  allowUploads?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={submitForm.bind(null, token)} className="space-y-6">
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="baseline" value={baselineJson} />
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Fax
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
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
            <label htmlFor="submitterOrg" className={labelCls}>{orgLabel}</label>
            <input id="submitterOrg" name="submitterOrg" maxLength={120} defaultValue={draft?.submitterOrg ?? ""} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="submitterEmail" className={labelCls}>Email</label>
            <input id="submitterEmail" name="submitterEmail" type="email" maxLength={200} defaultValue={draft?.submitterEmail ?? ""} className={inputCls} />
          </div>
        </div>
      </Card>

      {children}

      {allowUploads && <Files token={token} files={draft?.files ?? []} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FormButtons token={token} />
        {draft && <DiscardDraft token={token} />}
      </div>
    </form>
  );
}
