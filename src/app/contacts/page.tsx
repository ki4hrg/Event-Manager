import type { Metadata } from "next";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { btnPrimary } from "@/lib/buttonStyles";
import { getContacts } from "./actions";
import { formatPhone } from "@/lib/format-phone";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const contacts = await getContacts();
  const canWrite = await hasPermission("CONTACTS", "WRITE");

  return (
    <PageWrapper>
      <PageHeader
        title="Contacts"
        actions={
          canWrite ? (
            <Link href="/contacts/new" className={btnPrimary}>
              New Contact
            </Link>
          ) : null
        }
      />

      {contacts.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No contacts yet.
          {canWrite && (
            <>
              {" "}
              <Link href="/contacts/new" className="text-blue-600 dark:text-blue-400 hover:underline">
                Create your first contact
              </Link>
            </>
          )}
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Roles
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contact Info
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {contact.lastName}, {contact.firstName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {contact.organization || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {contact.roles.map((role) => (
                        <span
                          key={role}
                          className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {contact.email || formatPhone(contact.phone) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageWrapper>
  );
}
