"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleBadgeClass } from "@/lib/roleStyles";
import { btnOutlinedSm } from "@/lib/buttonStyles";
import { actionErrorMessage } from "@/lib/userErrors";

// One editor for both directions of the user <-> tenant relationship: the
// tenant page lists its members, the user page lists their organizations.
// Rows are "the other side" plus the role; the add form picks from whichever
// side isn't joined yet.

export type MembershipRow = {
  // The other side's id (userId on a tenant page, tenantId on a user page).
  id: string;
  label: string;
  sublabel?: string | null;
  href?: string;
  roleId: string;
  roleName: string;
};

type Option = { id: string; label: string };
type RoleOption = { id: string; name: string; isSystem: boolean };

type Props = {
  title: string;
  description: string;
  rows: MembershipRow[];
  candidates: Option[];
  candidateLabel: string;
  roles: RoleOption[];
  add: (otherId: string, roleId: string) => Promise<void>;
  setRole: (otherId: string, roleId: string) => Promise<void>;
  remove: (otherId: string) => Promise<void>;
};

// Inline confirm on the trigger, per the no-modal convention.
function RemoveButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onConfirm();
            setConfirming(false);
          }}
          className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-gray-500 dark:text-gray-400 hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}

const selectClass =
  "border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50";

export function MembershipEditor({
  title,
  description,
  rows,
  candidates,
  candidateLabel,
  roles,
  add,
  setRole,
  remove,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const defaultRoleId = roles.find((r) => r.name === "User")?.id ?? roles[0]?.id ?? "";
  const [roleId, setRoleId] = useState(defaultRoleId);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(actionErrorMessage(e, "An error occurred"));
      }
    });
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h2>
        {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((row) => (
            <li key={row.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[10rem] break-words">
                {row.href ? (
                  <Link href={row.href} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                    {row.label}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900 dark:text-white">{row.label}</span>
                )}
                {row.sublabel && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{row.sublabel}</div>
                )}
              </div>
              <span className={roleBadgeClass(row.roleName)}>{row.roleName}</span>
              <select
                aria-label={`Role for ${row.label}`}
                className={selectClass}
                value={row.roleId}
                disabled={pending}
                onChange={(e) => run(() => setRole(row.id, e.target.value))}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <RemoveButton disabled={pending} onConfirm={() => run(() => remove(row.id))} />
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!candidateId) return;
            run(async () => {
              await add(candidateId, roleId);
              setCandidateId("");
            });
          }}
        >
          <label className="min-w-0 max-w-full text-sm text-gray-700 dark:text-gray-300">
            <span className="block text-xs mb-1">{candidateLabel}</span>
            <select
              className={`${selectClass} max-w-full`}
              value={candidateId}
              disabled={pending}
              onChange={(e) => setCandidateId(e.target.value)}
            >
              <option value="">Select…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            <span className="block text-xs mb-1">Role</span>
            <select className={selectClass} value={roleId} disabled={pending} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.isSystem ? " (system)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending || !candidateId} className={`${btnOutlinedSm} disabled:opacity-50`}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}
