"use client";

import Link from "next/link";
import { btnPrimary } from "@/lib/buttonStyles";
import { useFormStatus } from "react-dom";
import type { Contact, CustomOption } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";

type ContactFormProps = {
  contact?: Contact;
  contactRoles: CustomOption[];
  action: (formData: FormData) => Promise<void>;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimary} disabled:opacity-50`}
    >
      {pending ? "Saving..." : isEdit ? "Update Contact" : "Create Contact"}
    </button>
  );
}

export function ContactForm({ contact, contactRoles, action }: ContactFormProps) {
  const isEdit = !!contact;
  // No view/edit toggle on this form, so read-only is a disabled fieldset.
  const canWrite = useCanWrite("CONTACTS");

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <fieldset disabled={!canWrite} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="firstName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              First Name *
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              defaultValue={contact?.firstName}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="lastName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Last Name *
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              required
              defaultValue={contact?.lastName}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="organization"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Organization
          </label>
          <input
            type="text"
            id="organization"
            name="organization"
            defaultValue={contact?.organization || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              defaultValue={contact?.email || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              defaultValue={contact?.phone || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Roles
          </label>
          {contactRoles.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No roles defined.{" "}
              <a href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">
                Add roles in Settings
              </a>
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {contactRoles.map((option) => (
                <label key={option.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="roles"
                    value={option.label}
                    defaultChecked={contact?.roles.includes(option.label)}
                    className="rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={contact?.notes || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

      </fieldset>

      <div className="flex gap-4">
        {canWrite && <SubmitButton isEdit={isEdit} />}
        <Link
          href="/contacts"
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {canWrite ? "Cancel" : "Back"}
        </Link>
      </div>
    </form>
  );
}
