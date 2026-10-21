"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { INBOX_UPLOAD_ACCEPT, isInboxUploadable } from "./views";

const inputClass =
  "block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm";

// Files saved from an online tool (a proposal as PDF, a pickup sheet), handed
// to the event inbox and read like emailed mail. Posts to the upload route:
// Server Actions can't take a PDF-sized body.
export function InboxDropZone({ eventId, basePath }: { eventId: string; basePath: string }) {
  const router = useRouter();
  const canWrite = useCanWrite("EVENTS");
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;

  const add = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const refused = picked.filter((f) => !isInboxUploadable(f.name));
    setError(refused.length ? `Not a supported file: ${refused.map((f) => f.name).join(", ")}` : null);
    setFiles((prev) => [...prev, ...picked.filter((f) => isInboxUploadable(f.name))]);
  };

  const upload = () =>
    startTransition(async () => {
      setError(null);
      const body = new FormData();
      for (const f of files) body.append("files", f);
      if (note.trim()) body.append("note", note.trim());
      const res = await fetch(`/api/events/${eventId}/inbox/upload`, { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Upload failed");
        return;
      }
      const message = `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`;
      setFiles([]);
      setNote("");
      router.push(`${basePath}?success=${encodeURIComponent(message)}`);
      router.refresh();
    });

  return (
    <div className="mb-4 space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm cursor-pointer ${
          over
            ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
            : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-500"
        }`}
      >
        Drop files here or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={INBOX_UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3">
          <ul className="space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-gray-900 dark:text-white">{f.name}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <input
            aria-label="Note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={upload} className={`${btnPrimary} disabled:opacity-50`}>
              {pending ? "Uploading…" : "Upload"}
            </button>
            <button type="button" disabled={pending} onClick={() => setFiles([])} className={`${btnSecondary} disabled:opacity-50`}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
