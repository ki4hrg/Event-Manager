"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FileUpload, CustomOption } from "@prisma/client";
import { deleteFile } from "@/app/files/actions";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileType, setSelectedFileType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const handleDelete = (fileId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"?`)) return;
    startTransition(async () => {
      await deleteFile(fileId, revalidateTarget);
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h2>

      <div className="space-y-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedFileType}
            onChange={(e) => setSelectedFileType(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">File type (optional)</option>
            {fileTypeOptions.map((opt) => (
              <option key={opt.label} value={opt.label}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="flex-1 min-w-0 text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-200 dark:hover:file:bg-gray-600"
          />
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
                  <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {label && <span>{label}</span>}
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(file.id, file.fileName)}
                  disabled={isPending}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 shrink-0 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
