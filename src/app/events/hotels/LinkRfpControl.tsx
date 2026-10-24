"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

const selectClass =
  "px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";

// Links a proposal that answers no RFP to one of the event's RFP blocks (a
// citywide RFP a CVB sent out, a hotel never listed): the hotel joins the
// RFP's recipients and its concessions carry over, as linking from the RFP.
export function LinkRfpControl({
  blocks,
  action,
}: {
  blocks: { id: string; label: string }[];
  action: (rfpBlockId: string) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const [open, setOpen] = useState(false);
  const [blockId, setBlockId] = useState(blocks[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canWrite || blocks.length === 0) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
        Link to RFP
      </button>
    );
  }
  const link = () =>
    startTransition(async () => {
      setError(null);
      try {
        await action(blockId);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select aria-label="RFP block" value={blockId} onChange={(e) => setBlockId(e.target.value)} className={selectClass}>
        {blocks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <button type="button" disabled={pending || !blockId} onClick={link} className={`${btnPrimary} disabled:opacity-50`}>
        {pending ? "Linking..." : "Link"}
      </button>
      <button type="button" disabled={pending} onClick={() => setOpen(false)} className={btnSecondary}>
        Cancel
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
