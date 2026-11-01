"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { DeleteButton } from "@/components/DeleteButton";
import { OrgProfileFields, OrgProfileView } from "@/components/OrgProfileFields";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import type { OrgProfile } from "@/lib/orgProfile";
import { keepFormValues } from "@/lib/keepFormValues";
import { type UserError, actionErrorMessage, isUserError } from "@/lib/userErrors";

function SubmitButton({ isCreate }: { isCreate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : isCreate ? "Create Organization" : "Save Changes"}
    </button>
  );
}

const inputClass =
  "mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500";

type Props = {
  tenant?: { id: string; name: string; slug: string } & OrgProfile;
  saveAction: (formData: FormData) => Promise<void | UserError>;
  deleteAction?: () => Promise<void | UserError>;
};

export function TenantForm({ tenant, saveAction, deleteAction }: Props) {
  const isCreate = !tenant;
  const [editing, setEditing] = useState(isCreate);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      const result = await saveAction(formData);
      if (isUserError(result)) setError(result.error);
    } catch (e) {
      setError(actionErrorMessage(e, "An error occurred"));
    }
  }

  if (!editing && tenant) {
    return (
      <div>
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">{tenant.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Slug</dt>
              <dd className="mt-1 font-mono text-gray-900 dark:text-white">{tenant.slug}</dd>
            </div>
          </dl>
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <OrgProfileView profile={tenant} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => setEditing(true)} className={btnPrimary}>
              Edit
            </button>
            {deleteAction && (
              <DeleteButton resource="SYSTEM" action={deleteAction} label="Delete organization" />
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
            Name *
          </label>
          <input type="text" id="name" name="name" required defaultValue={tenant?.name ?? ""} className={inputClass} />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Slug
          </label>
          <input
            type="text"
            id="slug"
            name="slug"
            defaultValue={tenant?.slug ?? ""}
            placeholder="Derived from the name when blank"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Short handle used by the MCP connector&apos;s <code>tenant</code> argument. Lowercase
            letters, digits, and dashes.
            {tenant && <> Also the first part of every event inbox address; changing it changes them all.</>}
          </p>
        </div>
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <OrgProfileFields profile={tenant} />
        </div>
        <div className="flex gap-3 pt-2">
          <SubmitButton isCreate={isCreate} />
          {!isCreate && (
            <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
