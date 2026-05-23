// Setup instructions for wiring a freshly-minted API key into Claude clients.
// Server component — receives the full origin URL from the page so the config
// snippet is copy-pasteable verbatim. No client state needed.

type Props = { mcpUrl: string };

export function SetupInstructions({ mcpUrl }: Props) {
  const desktopConfig = `{
  "mcpServers": {
    "event-manager": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_KEY_HERE"
      }
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
            Claude Desktop
          </p>
          <p className="mb-2">
            Edit <code>claude_desktop_config.json</code> and add the block
            below. The config key (<code>event-manager</code>) becomes the
            section heading for the tools in Claude&apos;s tool picker.
          </p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            <strong>macOS:</strong>{" "}
            <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
            <br />
            <strong>Windows:</strong>{" "}
            <code>%APPDATA%\Claude\claude_desktop_config.json</code>
          </p>
          <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-900 dark:text-gray-100 overflow-x-auto whitespace-pre">
            {desktopConfig}
          </pre>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Replace <code>YOUR_KEY_HERE</code> with the full key shown when you
            create it (it&apos;s only displayed once). Fully quit and reopen
            Claude Desktop — the new server appears in the tool picker.
          </p>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Verify with the MCP Inspector
          </p>
          <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-900 dark:text-gray-100 overflow-x-auto whitespace-pre">
            {`npx @modelcontextprotocol/inspector --cli ${mcpUrl} \\
  --transport http \\
  --header "Authorization: Bearer YOUR_KEY_HERE" \\
  --method tools/list`}
          </pre>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Lists every tool exposed to your key. Useful for confirming auth
            works before wiring up Claude Desktop.
          </p>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Why not the &quot;Custom Connector&quot; UI?
          </p>
          <p>
            Claude.ai and Claude Desktop&apos;s Custom Connector dialog
            currently only supports OAuth-based MCP servers — it doesn&apos;t
            accept static bearer tokens. This server is bearer-only, so use the
            local config above for now. If/when we add OAuth support, the
            Custom Connector will be the recommended path.
          </p>
        </section>
      </div>
    </details>
  );
}
