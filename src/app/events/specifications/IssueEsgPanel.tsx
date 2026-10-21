"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnDanger, btnOutlinedSm, btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { SpecProgressPanel } from "./SpecProgressPanel";

// Completeness plus Issue / Re-issue (stamps Date Originated, or Date Revised
// on a re-issue, and locks function numbers) and the unlock that renumbers.
// Both confirm inline on the trigger.
export function IssueEsgPanel({
  done,
  total,
  missing,
  sectionTitles,
  originated,
  revised,
  numbersLocked,
  issue,
  unlock,
}: {
  done: number;
  total: number;
  missing: { section: string; label: string }[];
  sectionTitles: Record<string, string>;
  originated: string | null;
  revised: string | null;
  numbersLocked: boolean;
  issue: () => Promise<void>;
  unlock: () => Promise<void>;
}) {
  const canWrite = useCanWrite("EVENTS");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"issue" | "unlock" | null>(null);

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      setConfirming(null);
      router.refresh();
    });

  const cancel = (
    <button
      type="button"
      disabled={pending}
      onClick={() => setConfirming(null)}
      className={`${btnSecondary} text-sm disabled:opacity-50`}
    >
      Cancel
    </button>
  );

  let actions = null;
  if (canWrite && confirming === "issue") {
    actions = (
      <>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {originated ? "Set Date revised to today?" : "Issue and lock function numbers?"}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(issue)}
          className={`${btnPrimary} text-sm disabled:opacity-50`}
        >
          {pending ? "Issuing…" : originated ? "Re-issue" : "Issue"}
        </button>
        {cancel}
      </>
    );
  } else if (canWrite && confirming === "unlock") {
    actions = (
      <>
        <span className="text-sm text-gray-600 dark:text-gray-400">Renumber by schedule?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(unlock)}
          className={`${btnDanger} text-sm disabled:opacity-50`}
        >
          {pending ? "Unlocking…" : "Unlock & renumber"}
        </button>
        {cancel}
      </>
    );
  } else if (canWrite) {
    actions = (
      <>
        <button type="button" onClick={() => setConfirming("issue")} className={`${btnPrimary} text-sm`}>
          {originated ? "Re-issue" : "Issue"}
        </button>
        {numbersLocked && (
          <button type="button" onClick={() => setConfirming("unlock")} className={btnOutlinedSm}>
            Unlock numbers
          </button>
        )}
      </>
    );
  }

  return (
    <SpecProgressPanel
      done={done}
      total={total}
      missing={missing}
      sectionTitles={sectionTitles}
      meta={
        <>
          {originated ? `Issued ${originated}` : "Not issued"}
          {revised ? ` · Revised ${revised}` : ""}
          {numbersLocked ? " · Numbers locked" : " · Numbers unlocked"}
        </>
      }
      actions={actions}
    />
  );
}
