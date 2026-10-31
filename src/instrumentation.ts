// Runs once when the server starts (never during `next build`). A bad
// environment stops the boot here, with the list of what's wrong.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/lib/env");
  try {
    env();
  } catch (err) {
    // Next only logs a throw from register() ("Failed to prepare server") and
    // leaves the process running without serving. Exit, so the container stops
    // and the deploy shows the failure.
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
