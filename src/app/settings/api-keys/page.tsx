import type { Metadata } from "next";
import { getApiKeys, getApiKeyUsers } from "./actions";
import { ApiKeyForm } from "./ApiKeyForm";
import { ApiKeyList } from "./ApiKeyList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "API Keys" };

export default async function ApiKeysPage() {
  const [keys, users] = await Promise.all([getApiKeys(), getApiKeyUsers()]);

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Bearer tokens for the MCP connector at <code>/api/mcp</code>. Each key
          belongs to a user and inherits that user's role and event assignments.
          Keys are shown once at creation — store them safely.
        </p>
      </div>
      <ApiKeyForm users={users} />
      <ApiKeyList keys={keys} />
    </div>
  );
}
