"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";

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

const roleBadgeClass = (role: string) =>
  `px-2 py-0.5 text-xs rounded ${
    role === "admin"
      ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
  }`;

interface UserFormProps {
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
  currentUserId?: string;
}

export function UserForm({ user, saveAction, deleteAction, currentUserId }: UserFormProps) {
  const isCreate = !user;
  const [editing, setEditing] = useState(isCreate);
  const [error, setError] = useState<string | null>(null);
  const isSelf = user?.id === currentUserId;

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await saveAction(formData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    }
  }

  if (!editing && user) {
    return (
      <div>
        <Toast />
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">{user.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">{user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Role</dt>
              <dd className="mt-1">
                <span className={roleBadgeClass(user.role)}>{user.role === "admin" ? "Admin" : "User"}</span>
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Edit
            </button>
            {deleteAction && !isSelf && (
              <DeleteButton
                action={deleteAction}
                confirmMessage="Are you sure you want to delete this user?"
              />
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
      <form action={handleSubmit} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-4">
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
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password {isCreate ? "*" : "(leave blank to keep current)"}
          </label>
          <input
            type="password"
            id="password"
            name="password"
            required={isCreate}
            minLength={6}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Role *
          </label>
          <select
            id="role"
            name="role"
            defaultValue={user?.role || "user"}
            disabled={!isCreate && isSelf}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          {!isCreate && isSelf && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              You cannot change your own role
            </p>
          )}
        </div>

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
