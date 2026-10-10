import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getApiKeys } from "./actions";
import { ApiKeyForm } from "./ApiKeyForm";
import { ApiKeyList } from "./ApiKeyList";
import { SetupInstructions } from "./SetupInstructions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "API Keys" };

// Compute the absolute MCP URL from the current request's host header so the
// setup snippets are copy-pasteable verbatim across environments.
async function getMcpUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/mcp`;
}

export default async function ApiKeysPage() {
  const [keys, mcpUrl] = await Promise.all([getApiKeys(), getMcpUrl()]);

  return (
    <PageWrapper>
      <div className="mb-4">
        <Link
          href="/account"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Account
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        API Keys
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Bearer tokens for the MCP connector at <code>/mcp</code>. Each key
        inherits your role and event assignments. The full key is shown once at
        creation — store it safely.
      </p>
      <SetupInstructions mcpUrl={mcpUrl} />
      <ApiKeyForm />
      <ApiKeyList keys={keys} />
    </PageWrapper>
  );
}
