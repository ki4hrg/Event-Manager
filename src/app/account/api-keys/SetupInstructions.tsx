// Setup instructions for wiring a freshly-minted API key into Claude clients.
// Server component — receives the full origin URL from the page so the config
// snippet is copy-pasteable verbatim. No client state needed.

type Props = { mcpUrl: string };

export function SetupInstructions({ mcpUrl }: Props) {
  // Claude Desktop's `mcpServers` schema only accepts stdio-based entries
  // (`command` + `args`). For a remote HTTPS MCP endpoint we run the
  // `mcp-remote` npm bridge as a child process — it spawns as stdio to
  // Claude Desktop and proxies to our HTTP endpoint, forwarding the bearer
  // header. (Claude Code's config DOES accept `type: "http"` directly, but
  // Claude Desktop ignores entries with that shape with the error
  // `not valid MCP server configurations and were skipped`.)
  const serverEntry = `"event-manager": {
  "command": "npx",
  "args": [
    "-y",
    "mcp-remote",
    "${mcpUrl}",
    "--header",
    "Authorization: Bearer YOUR_KEY_HERE"
  ]
}`;

  // Full file — for users starting from an empty / non-existent config.
  const fullConfig = `{
  "mcpServers": {
    ${serverEntry.split("\n").join("\n    ")}
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
            Claude mobile &amp; web (recommended)
          </p>
          <p className="mb-2">
            In Claude, add a <strong>custom connector</strong> and paste the MCP
            endpoint URL above. Claude opens an Event Manager sign-in page — log
            in with your normal <strong>email and password</strong>. No API key
            needed; the connector authenticates over OAuth and inherits your role
            and event assignments automatically.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This is the only option that works on Claude mobile. The API keys
            below are for local stdio clients (Claude Desktop) that can&apos;t do
            the OAuth browser flow.
          </p>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Claude Desktop (API key)
          </p>
          <p className="mb-2">
            Edit <code>claude_desktop_config.json</code>. The config key
            (<code>event-manager</code>) becomes the section heading for the
            tools in Claude&apos;s tool picker.
          </p>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            <strong>macOS:</strong>{" "}
            <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
            <br />
            <strong>Windows:</strong>{" "}
            <code>%APPDATA%\Claude\claude_desktop_config.json</code>
          </p>

          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2 mt-4">
            If the file already exists (most setups)
          </p>
          <p className="mb-2">
            The file almost always has a <code>preferences</code> block and
            possibly other <code>mcpServers</code> entries already. Leave them
            alone. Add this entry inside the existing <code>mcpServers</code>{" "}
            object (or create the <code>mcpServers</code> key alongside{" "}
            <code>preferences</code> if it&apos;s not there yet):
          </p>
          <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-900 dark:text-gray-100 overflow-x-auto whitespace-pre">
            {serverEntry}
          </pre>

          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2 mt-4">
            If the file is empty or doesn&apos;t exist
          </p>
          <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-900 dark:text-gray-100 overflow-x-auto whitespace-pre">
            {fullConfig}
          </pre>

          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
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
            Which method should I use?
          </p>
          <p>
            Use the <strong>custom connector (OAuth)</strong> for Claude mobile
            and claude.ai — it&apos;s the only path that works there, and
            needs no API key. Use an <strong>API key</strong> with the local
            config above for Claude Desktop and other stdio clients that can&apos;t
            run the OAuth browser flow.
          </p>
        </section>
      </div>
    </details>
  );
}
