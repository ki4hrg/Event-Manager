"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InboundStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnOutlinedSm, btnPrimary, btnSecondary } from "@/lib/buttonStyles";

type Destination = { id: string; name: string };

// Release / Dismiss / Restore / Move for one inbox item. The actions arrive
// bound to the item; each re-checks permission itself.
export function InboxItemActions({
  status,
  routed,
  destinations,
  release,
  dismiss,
  restore,
  move,
}: {
  status: InboundStatus;
  routed: boolean;
  destinations: Destination[];
  release?: () => Promise<void>;
  dismiss: () => Promise<void>;
  restore: () => Promise<void>;
  move: (toEventId: string) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const [pending, startTransition] = useTransition();
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState("");

  if (!canWrite) return null;

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const open = status !== "APPLIED" && status !== "DISMISSED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {routed && status === "HELD" && release && (
        <button type="button" disabled={pending} onClick={() => run(release)} className={`${btnPrimary} disabled:opacity-50`}>
          Release
        </button>
      )}
      {open && (
        <button type="button" disabled={pending} onClick={() => run(dismiss)} className={`${btnSecondary} disabled:opacity-50`}>
          Dismiss
        </button>
      )}
      {status === "DISMISSED" && (
        <button type="button" disabled={pending} onClick={() => run(restore)} className={`${btnSecondary} disabled:opacity-50`}>
          Restore
        </button>
      )}
      {status !== "APPLIED" &&
        (moving ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="px-2 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white max-w-[16rem]"
            >
              <option value="">Choose an event…</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !target}
              onClick={() => startTransition(() => move(target))}
              className={`${btnPrimary} disabled:opacity-50`}
            >
              {routed ? "Move" : "Route"}
            </button>
            <button type="button" onClick={() => setMoving(false)} className={btnOutlinedSm}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setMoving(true)} className={btnOutlinedSm}>
            {routed ? "Move to another event" : "Route to an event"}
          </button>
        ))}
    </div>
  );
}

export function FileAttachmentButton({ filed, file }: { filed: boolean; file: () => Promise<void> }) {
  const router = useRouter();
  const canWrite = useCanWrite("FILES");
  const [pending, startTransition] = useTransition();
  if (filed) return <span className="text-xs text-green-700 dark:text-green-400">Filed</span>;
  if (!canWrite) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await file();
          router.refresh();
        })
      }
      className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
    >
      {pending ? "Filing…" : "File on event"}
    </button>
  );
}
