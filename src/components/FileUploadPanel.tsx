"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FileUpload, CustomOption } from "@prisma/client";
import { deleteFile } from "@/app/files/actions";
import { useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";
import { formatFileSize, type EntityType } from "@/lib/uploads";

type FileUploadPanelProps = {
  entityType: EntityType;
  entityId: string;
  files: FileUpload[];
  fileTypeOptions: CustomOption[];
  revalidateTarget: string;
  title?: string;
};

export function FileUploadPanel({
  entityType,
  entityId,
  files,
  fileTypeOptions,
  revalidateTarget,
  title = "Files",
}: FileUploadPanelProps) {
  const router = useRouter();
  // Upload gates on FILES.WRITE (src/app/api/upload/route.ts), removal on
  // FILES.DELETE (src/app/files/actions.ts) — mirror both rather than
  // collapsing them, so a WRITE-capped user can still attach files.
  const canUpload = useCanWrite("FILES");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileType, setSelectedFileType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    const input = fileInputRef.current;
    if (!input?.files?.length) return;

    setError(null);
    setUploading(true);

    try {
      for (const file of Array.from(input.files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", entityType);
        formData.append("entityId", entityId);
        if (selectedFileType) formData.append("fileType", selectedFileType);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? "Upload failed");
        }
      }

      input.value = "";
      setSelectedFileType("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h2>

      {canUpload && (
      <div className="space-y-3 mb-4">
        {/* The file input gets a row of its own so narrow columns don't clip it. */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="block w-full min-w-0 text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-200 dark:hover:file:bg-gray-600"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedFileType}
            onChange={(e) => setSelectedFileType(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">File type (optional)</option>
            {fileTypeOptions.map((opt) => (
              <option key={opt.label} value={opt.label}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No files attached.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {files.map((file) => {
            const label = file.fileType;
            return (
              <li key={file.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={`/api/files/${file.id}`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block"
                    title={file.fileName}
                  >
                    {file.fileName}
                  </a>
                  <div className="flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {label && <span>{label}</span>}
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className="shrink-0">
                  <InlineConfirmButton
                    onConfirm={() => deleteFile(file.id, revalidateTarget)}
                    label="Remove"
                    resource="FILES"
                    requiredLevel="DELETE"
                    className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
