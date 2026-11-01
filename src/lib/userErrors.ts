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

// What a client shows for an error a Server Action threw (#252). In production
// React replaces a thrown action's message ("Minified React error #441", "An
// error occurred in the Server Components render"), which tells the person
// nothing; those read as the caller's own `fallback` sentence. Any other
// message (an error thrown in the browser, or any message in development)
// is shown as is. Refusals meant for the person still come back as { error }.
const REDACTED = /Minified React error|An error occurred in the Server Components render|react\.dev\/errors\/441/;

export function actionErrorMessage(e: unknown, fallback: string): string {
  if (!(e instanceof Error) || !e.message || REDACTED.test(e.message)) return fallback;
  return e.message;
}
