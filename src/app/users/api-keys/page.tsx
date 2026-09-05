import type { Metadata } from "next";
import Link from "next/link";
import { getAllApiKeys } from "./actions";
import { AdminApiKeyList } from "./AdminApiKeyList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "API Keys" };

export default async function AdminApiKeysPage() {
  const keys = await getAllApiKeys();

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          API keys owned by members of this organization. Each key inherits its
          owning user&apos;s memberships, roles, and event assignments. Revoke a key here to disable it
          immediately. Users mint their own keys under{" "}
          <Link
            href="/account/api-keys"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            /account/api-keys
          </Link>
          .
        </p>
      </div>
      <AdminApiKeyList keys={keys} />
    </div>
  );
}
