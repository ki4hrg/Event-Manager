"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { roleBadgeClass } from "@/lib/roleStyles";
import { UNCAPPED } from "@/lib/accessLevels";
import { AccessLevelSelect } from "@/components/AccessLevelSelect";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";

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
  addStaff: (formData: FormData) => Promise<void>;
  removeStaff: (staffId: string) => Promise<void>;
  setLevel: (staffId: string, accessLevel: string) => Promise<void>;
  searchUsers: (query: string) => Promise<UserSearchResult[]>;
};


function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

export function EventStaffList({ staff, addStaff, removeStaff, setLevel, searchUsers }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        setResults(await searchUsers(query));
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query, searchUsers]);

  const closeAdd = () => {
    setShowAdd(false);
    setQuery("");
    setResults([]);
    setSelected(null);
  };

  const handleSubmit = async (formData: FormData) => {
    if (!selected) return;
    formData.set("userId", selected.id);
    await addStaff(formData);
    closeAdd();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Assigned Staff
        </p>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add
          </button>
        )}
      </div>

      {showAdd && (
        <form
          action={handleSubmit}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3"
        >
          {!selected ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search Users *
              </label>
              <input
                type="text"
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
                        setQuery("");
                        setResults([]);
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
              {query.length >= 2 && !isSearching && results.length === 0 && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No matching users found.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Selected User
              </label>
              <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <span className="text-gray-900 dark:text-white text-sm">
                  {selected.name || selected.email}
                  {selected.name && (
                    <span className="text-gray-500 dark:text-gray-400"> · {selected.email}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
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

          <div className="flex gap-2 pt-1">
            <SubmitButton label="Assign" />
            <button
              type="button"
              onClick={closeAdd}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {staff.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No staff assigned yet.</p>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {staff.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between py-3">
              <div className="space-y-0.5 min-w-0">
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
              <div className="flex items-center gap-3 ml-2 shrink-0">
                <AccessLevelSelect
                  ariaLabel={`Access for ${entry.user.name || entry.user.email}`}
                  value={entry.accessLevel ?? UNCAPPED}
                  disabled={isPending}
                  onChange={(next) => {
                    startTransition(async () => {
                      await setLevel(entry.id, next);
                    });
                  }}
                />
                <InlineDeleteButton
                  action={async () => {
                    await removeStaff(entry.id);
                  }}
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
