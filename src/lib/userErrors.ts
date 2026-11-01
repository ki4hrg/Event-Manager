// A refusal the user can act on ("Pick at least one section"). Next replaces a
// thrown message with a generic one in production, so an action called from
// useTransition wraps its body in withUserErrors and returns { error } for
// these. Every other throw (invariants, authorization) still throws.

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export type UserError = { error: string };

export async function withUserErrors<T>(fn: () => Promise<T>): Promise<T | UserError> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserFacingError) return { error: e.message };
    throw e;
  }
}

// Narrows an action's result on the client: `if (isUserError(r)) setError(r.error)`.
export function isUserError(result: unknown): result is UserError {
  return typeof result === "object" && result !== null && "error" in result && typeof result.error === "string";
}

// What a client shows for an error a Server Action threw (#252). A thrown
// action error reaches the client with a `digest` and, in production, a
// placeholder message ("Minified React error #441"); its text means nothing to
// staff either way, so it reads as the caller's own `fallback` sentence, in
// development too (so an unwrapped refusal is caught while testing). So do
// network and framework failures ("Failed to fetch", a Server Action missing
// after a deploy). An error thrown in the browser (a file that won't parse)
// shows its message. Refusals meant for the person come back as { error }
// through withUserErrors instead.
// Network failures read differently per browser: Chrome "Failed to fetch",
// Safari "Load failed", Firefox "NetworkError when attempting to fetch resource".
const FRAMEWORK =
  /Minified React error|Server Components render|^Failed to fetch$|^Load failed$|^NetworkError when attempting to fetch resource\.?$|Server Action .* was not found|unexpected response was received|^NEXT_/;

export function actionErrorMessage(e: unknown, fallback: string): string {
  if (!(e instanceof Error) || !e.message || "digest" in e || FRAMEWORK.test(e.message)) {
    // The fallback replaces it on screen; keep the real error for whoever debugs.
    console.error(e);
    return fallback;
  }
  return e.message;
}
