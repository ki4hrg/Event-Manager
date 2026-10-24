import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getAllApiKeys } from "./actions";
import { AdminApiKeyList } from "./AdminApiKeyList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "API Keys" };

export default async function AdminApiKeysPage() {
  const keys = await getAllApiKeys();

  return (
    <div>
      <PageHeader title="API Keys" />
      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Revoke keys owned by members. Users manage their own at{" "}
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
