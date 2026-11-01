"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";
import { roleBadgeClass } from "@/lib/roleStyles";
import { DEFAULT_ROLE_NAME } from "@/app/(admin)/users/roles/resources";
import { keepFormValues } from "@/lib/keepFormValues";
import { type UserError, actionErrorMessage, isUserError } from "@/lib/userErrors";

function SubmitButton({ isCreate }: { isCreate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isCreate ? "Create User" : "Save Changes"}
    </button>
  );
}

// assignable: within the signed-in admin's role ceiling (#284).
type RoleOption = { id: string; name: string; isSystem: boolean; assignable?: boolean };

interface UserFormProps {
  user?: {
    id: string;
    email: string;
    name: string | null;
    roleId: string | null;
    roleRef: { id: string; name: string } | null;
    isSuperAdmin?: boolean;
    showDiagnostics?: boolean;
  };
  roles: RoleOption[];
  saveAction: (formData: FormData) => Promise<void | UserError>;
  deleteAction?: () => Promise<void>;
  // Removes the membership in the active tenant without deleting the account.
  removeAction?: () => Promise<void | UserError>;
  currentUserId?: string;
  tenantName?: string | null;
  // Only super admins may grant or revoke platform-admin status.
  canManageSuperAdmin?: boolean;
}

export function UserForm({
  user,
  roles,
  saveAction,
  deleteAction,
  removeAction,
  currentUserId,
  tenantName,
  canManageSuperAdmin = false,
}: UserFormProps) {
  const isCreate = !user;
  const [editing, setEditing] = useState(isCreate);
  const [error, setError] = useState<string | null>(null);
  const isSelf = !!user && !!currentUserId && user.id === currentUserId;
  // A member whose role is above the signed-in admin's ceiling (#284): the
  // server refuses edits and removal, so they aren't offered.
  const outOfReach = !!user && !isSelf && roles.find((r) => r.id === user.roleId)?.assignable === false;

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      // A refusal comes back as { error } (withUserErrors) so its text survives.
      const result = await saveAction(formData);
      if (isUserError(result)) setError(result.error);
    } catch (e) {
      setError(actionErrorMessage(e, "An error occurred"));
    }
  }

  const defaultRoleId =
    user?.roleId ??
    roles.find((r) => r.name === DEFAULT_ROLE_NAME && r.assignable !== false)?.id ??
    roles.find((r) => r.assignable !== false)?.id ??
    "";

  if (!editing && user) {
    return (
      <div>
        <Toast />
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">{user.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="mt-1 text-gray-900 dark:text-white break-words">{user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Role{tenantName ? ` in ${tenantName}` : ""}
              </dt>
              <dd className="mt-1">
                <span className={roleBadgeClass(user.roleRef?.name ?? null)}>
                  {user.roleRef?.name ?? "Not a member"}
                </span>
              </dd>
            </div>
            {!user.isSuperAdmin && user.showDiagnostics && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Platform</dt>
                <dd className="mt-1">
                  <span className="px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    Diagnostics
                  </span>
                </dd>
              </div>
            )}
            {user.isSuperAdmin && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Platform</dt>
                <dd className="mt-1">
                  <span className="px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                    Super admin
                  </span>
                </dd>
              </div>
            )}
          </dl>
          {outOfReach && (
            <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
              This member&rsquo;s role has access you don&rsquo;t have, so only someone with at least that access can change them.
            </p>
          )}
          <div className={`mt-6 flex flex-wrap gap-3 ${outOfReach ? "hidden" : ""}`}>
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Edit
            </button>
            {removeAction && !isSelf && user.roleRef && (
              <DeleteButton resource="USERS" action={removeAction} label="Remove from organization" />
            )}
            {deleteAction && !isSelf && (
              <DeleteButton resource="USERS" action={deleteAction} label="Delete account" />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      <form action={handleSubmit} onReset={keepFormValues} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            defaultValue={user?.name || ""}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            defaultValue={user?.email || ""}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="roleId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Role{tenantName ? ` in ${tenantName}` : ""} *
          </label>
          <select
            id="roleId"
            name="roleId"
            required
            defaultValue={defaultRoleId}
            disabled={isSelf}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          >
            {/* Roles the admin can't give stay listed (the member's current one must
                show) but can't be picked. */}
            {roles.map((role) => (
              <option key={role.id} value={role.id} disabled={role.assignable === false && role.id !== user?.roleId}>
                {role.name}
                {role.isSystem ? " (system)" : ""}
              </option>
            ))}
          </select>
          {isSelf && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              You cannot change your own role
            </p>
          )}
        </div>

        {canManageSuperAdmin && !isSelf && (
          <div>
            {/* Marker so the server can tell "unchecked" from "field absent" */}
            <input type="hidden" name="isSuperAdminField" value="1" />
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                name="isSuperAdmin"
                value="true"
                defaultChecked={user?.isSuperAdmin ?? false}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Super admin (every permission in every organization; can manage organizations)
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                name="showDiagnostics"
                value="true"
                defaultChecked={user?.showDiagnostics ?? false}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show diagnostics (raw email, mail authentication, parser details)
            </label>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <SubmitButton isCreate={isCreate} />
          {!isCreate && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
