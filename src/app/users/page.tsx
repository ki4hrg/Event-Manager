import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getUsers } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <PageWrapper>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Users
        </h1>
        <Link
          href="/users/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          New User
        </Link>
      </div>

      {users.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No users yet.{" "}
          <Link href="/users/new" className="text-blue-600 hover:underline">
            Create your first user
          </Link>
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
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <Link
                      href={`/users/${user.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {user.name || user.email}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        user.role === "admin"
                          ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {user.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {user.createdAt.toLocaleDateString()}
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
