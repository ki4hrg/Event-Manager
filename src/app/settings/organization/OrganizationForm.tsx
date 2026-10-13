"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { OrgProfileFields, OrgProfileView } from "@/components/OrgProfileFields";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import type { OrgProfile } from "@/lib/orgProfile";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}

export function OrganizationForm({
  org,
  saveAction,
}: {
  org: { name: string } & OrgProfile;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const canWrite = useCanWrite("SETTINGS");
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">{org.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Fills the host-organization fields of each event&apos;s Event Specifications Guide (§A) unless the event
            overrides them.
          </p>
        </div>
        {canWrite && !editing && (
          <button type="button" onClick={() => setEditing(true)} className={btnPrimary}>
            Edit details
          </button>
        )}
      </div>
      {editing && canWrite ? (
        <form action={saveAction} className="space-y-4">
          <OrgProfileFields profile={org} />
          <div className="flex gap-3 pt-2">
            <SubmitButton />
            <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <OrgProfileView profile={org} />
      )}
    </div>
  );
}
