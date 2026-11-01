"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { roleBadgeClass } from "@/lib/roleStyles";
import { UNCAPPED } from "@/lib/accessLevels";
import { AccessLevelSelect } from "@/components/AccessLevelSelect";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { useCanWrite } from "@/components/PermissionsProvider";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { ActionForm, ActionFormError, FormError } from "@/components/FormError";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

type StaffEntry = {
  id: string;
  accessLevel: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    roleRef: { id: string; name: string } | null;
  };
};

type UserSearchResult = {
  id: string;
  email: string;
  name: string | null;
  roleRef: { name: string } | null;
};

type Props = {
  staff: StaffEntry[];
  addStaff: (formData: FormData) => Promise<void | UserError>;
  removeStaff: (staffId: string) => Promise<void | UserError>;
  setLevel: (staffId: string, accessLevel: string) => Promise<void | UserError>;
  searchUsers: (query: string) => Promise<UserSearchResult[]>;
};


function SubmitButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

export function EventStaffList({ staff, addStaff, removeStaff, setLevel, searchUsers }: Props) {
  // Staff assignment gates on EVENTS.WRITE — see src/app/events/[id]/staff/actions.ts.
  const canWrite = useCanWrite("EVENTS");
  const [showAdd, setShowAdd] = useState(false);
  const { query, setQuery, results, isSearching, noMatches, clear } = useDebouncedSearch(searchUsers);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const closeAdd = () => {
    setShowAdd(false);
    clear();
    setSelected(null);
  };

  const handleSubmit = async (formData: FormData) => {
    if (!selected) return { error: "Pick a person" };
    formData.set("userId", selected.id);
    return addStaff(formData);
  };

  // An access change refused by the server (e.g. your own cap) shows above the list.
  const [levelError, setLevelError] = useState<string | null>(null);
  const changeLevel = (staffId: string, next: string) =>
    startTransition(async () => {
      setLevelError(null);
      try {
        const result = await setLevel(staffId, next);
        if (isUserError(result)) setLevelError(result.error);
      } catch (e) {
        setLevelError(actionErrorMessage(e, "Couldn't change access. Try again."));
      }
    });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Assigned Staff
        </p>
        {!showAdd && canWrite && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add
          </button>
        )}
      </div>

      {showAdd && (
        <ActionForm
          action={handleSubmit}
          onDone={closeAdd}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3"
        >
          {!selected ? (
            <div>
              <label
                htmlFor="staff-user-search"
                className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Search *
              </label>
              <input
                id="staff-user-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                autoFocus
              />
              {isSearching && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Searching...</p>
              )}
              {results.length > 0 && (
                <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md max-h-40 overflow-y-auto">
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelected(u);
                        clear();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                    >
                      <span className="text-gray-900 dark:text-white font-medium">
                        {u.name || u.email}
                      </span>
                      {u.name && (
                        <span className="text-gray-400 dark:text-gray-500 block text-xs">{u.email}</span>
                      )}
                      {u.roleRef && (
                        <span className="text-gray-400 dark:text-gray-500 text-xs"> · {u.roleRef.name}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {noMatches && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No matching users found.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                User
              </label>
              <div className="flex items-center justify-between gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <span className="min-w-0 break-words text-gray-900 dark:text-white text-sm">
                  {selected.name || selected.email}
                  {selected.name && (
                    <span className="text-gray-500 dark:text-gray-400"> · {selected.email}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="new-staff-access"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Access
            </label>
            <AccessLevelSelect
              ariaLabel="Access level for new assignment"
              id="new-staff-access"
              name="accessLevel"
              defaultValue="VIEW"
            />
          </div>

          <ActionFormError />
          <div className="flex gap-2 pt-1">
            <SubmitButton label="Assign" disabled={!selected} />
            <button
              type="button"
              onClick={closeAdd}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </ActionForm>
      )}

      <FormError error={levelError} className="mb-3" />
      {staff.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No staff assigned</p>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {staff.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="space-y-0.5 min-w-0 flex-1 basis-40">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {entry.user.name || entry.user.email}
                </p>
                {entry.user.name && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {entry.user.email}
                  </p>
                )}
                {entry.user.roleRef && (
                  <span className={roleBadgeClass(entry.user.roleRef.name)}>
                    {entry.user.roleRef.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <AccessLevelSelect
                  ariaLabel={`Access for ${entry.user.name || entry.user.email}`}
                  value={entry.accessLevel ?? UNCAPPED}
                  disabled={isPending || !canWrite}
                  onChange={(next) => changeLevel(entry.id, next)}
                />
                <InlineDeleteButton
                  resource="EVENTS"
                  requiredLevel="WRITE"
                  action={() => removeStaff(entry.id)}
                  hiddenInputs={{}}
                  label="Remove"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
