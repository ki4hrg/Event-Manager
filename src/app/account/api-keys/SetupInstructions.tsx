// Setup instructions for wiring a freshly-minted API key into Claude clients.
// Server component — receives the full origin URL from the page so the config
// snippet is copy-pasteable verbatim. No client state needed.

type Props = { mcpUrl: string };

const CONNECTOR_STEPS = [
  "Open Claude.ai (or the Claude desktop app), go to Settings → Connectors.",
  "Click Add custom connector.",
  "Give it a name (e.g. \"Event Manager\") and paste the MCP URL above.",
  "Under Authorization, choose Bearer token and paste your key.",
  "Save. The connector's tools become available in a new chat — toggle them on under the chat's Connectors menu.",
] as const;

export function SetupInstructions({ mcpUrl }: Props) {
  const localConfigSnippet = `{
  "mcpServers": {
    "event-manager": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--header",
        "Authorization: Bearer YOUR_KEY_HERE"
      ]
    }
  }
}`;

  return (
    <details className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900/30">
        How to use your key with Claude
      </summary>
      <div className="px-4 pb-4 pt-1 text-sm text-gray-700 dark:text-gray-300 space-y-5">
        <section>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">
            MCP endpoint
          </p>
          <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-900 dark:text-gray-100 break-all whitespace-pre-wrap">
            {mcpUrl}
          </pre>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Option A — Custom Connector (recommended)
          </p>
          <p className="mb-2">
            Available in Claude.ai and Claude Desktop for Pro and Team plans.
            Tools appear under their own labeled section instead of a generic
            &quot;Other tools&quot; group.
          </p>
          <ol className="list-decimal list-outside ml-5 space-y-1">
            {CONNECTOR_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Option B — Local Claude Desktop config
          </p>
          <p className="mb-2">
            Edit <code>claude_desktop_config.json</code> (on macOS:{" "}
            <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
            ). Uses the <code>mcp-remote</code> bridge to translate Claude
            Desktop&apos;s stdio transport to this HTTP endpoint:
          </p>
          <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-900 dark:text-gray-100 overflow-x-auto whitespace-pre">
            {localConfigSnippet}
          </pre>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Replace <code>YOUR_KEY_HERE</code> with the full key shown when you
            create it (it&apos;s only displayed once). Restart Claude Desktop
            after editing.
          </p>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Option C — Inspector (verify the connection)
          </p>
          <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-900 dark:text-gray-100 overflow-x-auto whitespace-pre">
            {`npx @modelcontextprotocol/inspector --cli ${mcpUrl} \\
  --transport http \\
  --header "Authorization: Bearer YOUR_KEY_HERE" \\
  --method tools/list`}
          </pre>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Lists every tool exposed to your key. Useful for confirming auth
            works before wiring up the connector.
          </p>
        </section>
      </div>
    </details>
  );
}
