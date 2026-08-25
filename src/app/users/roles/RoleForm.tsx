"use client";

import { Fragment, useState } from "react";
import { useFormStatus } from "react-dom";
import { PermissionLevel, PermissionScope, type PermissionResource, type RolePermission } from "@prisma/client";
import { DeleteButton } from "@/components/DeleteButton";
import { btnPrimary } from "@/lib/buttonStyles";
import {
  PERMISSION_GROUPS,
  PERMISSION_LEVELS,
  EVENT_SCOPES,
  permissionFieldName,
} from "./resources";

function buildPermissionMap(perms: RolePermission[] | undefined): Map<string, PermissionLevel> {
  const map = new Map<string, PermissionLevel>();
  if (!perms) return map;
  for (const p of perms) {
    map.set(`${p.resource}:${p.scope}`, p.level);
  }
  return map;
}

function SubmitButton({ isCreate }: { isCreate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : isCreate ? "Create Role" : "Save Changes"}
    </button>
  );
}

type RoleFormProps = {
  role?: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: RolePermission[];
  };
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
};

export function RoleForm({ role, saveAction, deleteAction }: RoleFormProps) {
  const isCreate = !role;
  const readOnly = !!role?.isSystem;
  const [error, setError] = useState<string | null>(null);
  const permMap = buildPermissionMap(role?.permissions);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await saveAction(formData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      {readOnly && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-800 dark:text-amber-300 text-sm">
          This is a system role and cannot be edited or deleted.
        </div>
      )}
      <form action={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            {readOnly ? (
              <p className="mt-1 text-gray-900 dark:text-white">{role.name}</p>
            ) : (
              <input
                type="text"
                id="name"
                name="name"
                required
                defaultValue={role?.name || ""}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            {readOnly ? (
              <p className="mt-1 text-gray-900 dark:text-white">{role.description || "—"}</p>
            ) : (
              <textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={role?.description || ""}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>
        </div>

        <PermissionMatrix permMap={permMap} readOnly={readOnly} />

        {!readOnly && (
          <div className="flex gap-3">
            <SubmitButton isCreate={isCreate} />
            {role && <DeleteRoleControls deleteAction={deleteAction} />}
          </div>
        )}
      </form>
    </div>
  );
}

function DeleteRoleControls({ deleteAction }: { deleteAction?: () => Promise<void> }) {
  if (!deleteAction) return null;
  return <DeleteButton action={deleteAction} label="Delete Role" />;
}

function PermissionMatrix({
  permMap,
  readOnly,
}: {
  permMap: Map<string, PermissionLevel>;
  readOnly: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Permissions</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Levels are ordinal: View &lt; Write &lt; Delete.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left font-medium text-gray-500 dark:text-gray-400 py-2 pr-4">Resource</th>
              {EVENT_SCOPES.map((s) => (
                <th
                  key={s.value}
                  className="text-left font-medium text-gray-500 dark:text-gray-400 py-2 px-2"
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {PERMISSION_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {group.label}
                  </td>
                </tr>
                {group.resources.map(({ value: resource, label }) => (
                  <tr key={resource}>
                    <td className="py-2 pr-4 text-gray-900 dark:text-white">{label}</td>
                    {EVENT_SCOPES.map(({ value: scope }) =>
                      group.scopes.includes(scope) ? (
                        <td key={scope} className="py-2 px-2">
                          <LevelCell
                            resource={resource}
                            scope={scope}
                            value={permMap.get(`${resource}:${scope}`) ?? PermissionLevel.NONE}
                            readOnly={readOnly}
                          />
                        </td>
                      ) : (
                        <td key={scope} className="py-2 px-2 text-gray-400 dark:text-gray-600">
                          —
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelCell({
  resource,
  scope,
  value,
  readOnly,
}: {
  resource: PermissionResource;
  scope: PermissionScope;
  value: PermissionLevel;
  readOnly: boolean;
}) {
  if (readOnly) {
    return <span className="text-gray-900 dark:text-white">{labelForLevel(value)}</span>;
  }
  return (
    <select
      name={permissionFieldName(resource, scope)}
      defaultValue={value}
      className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
    >
      {PERMISSION_LEVELS.map(({ value: level, label }) => (
        <option key={level} value={level}>
          {label}
        </option>
      ))}
    </select>
  );
}

function labelForLevel(level: PermissionLevel): string {
  return PERMISSION_LEVELS.find((l) => l.value === level)?.label ?? level;
}
