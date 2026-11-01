// The refusal every permission and ownership check throws. Its own module, with
// no imports, so plain helpers (src/lib/validation.ts) can throw it without
// loading auth or Prisma; @/lib/permissions re-exports it.

export type PermissionErrorKind = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";

// Thrown by requirePermissionForUser when access is denied. The session-bound
// requirePermission() wrapper catches this and translates to redirect()/notFound()
// for the UI; the MCP route handler catches it and maps to a protocol-level error.
// Never let this escape to a Next render — Next won't know how to handle it.
export class PermissionError extends Error {
  readonly kind: PermissionErrorKind;
  constructor(kind: PermissionErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "PermissionError";
    this.kind = kind;
  }
}
