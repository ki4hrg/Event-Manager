"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  buildErrorRedirect,
  createAuthorizationCode,
  validateAuthorizationRequest,
} from "@/lib/mcpOAuth";

// Server Actions behind the OAuth approval screen. The authorization request
// round-trips through the browser as a query string, so both actions re-validate
// it from scratch — the client_id / redirect_uri / PKCE challenge posted back
// are re-checked against the registered client before anything is minted.

function requestParams(formData: FormData): URLSearchParams {
  return new URLSearchParams({
    client_id: (formData.get("client_id") as string) || "",
    redirect_uri: (formData.get("redirect_uri") as string) || "",
    code_challenge: (formData.get("code_challenge") as string) || "",
    code_challenge_method:
      (formData.get("code_challenge_method") as string) || "S256",
    state: (formData.get("state") as string) || "",
    scope: (formData.get("scope") as string) || "",
    response_type: "code",
  });
}

export async function approveAuthorization(formData: FormData) {
  const session = await requireAuth();

  const result = await validateAuthorizationRequest(requestParams(formData));
  if (!result.ok) {
    throw new Error(`Authorization request rejected: ${result.errorDescription}`);
  }

  const target = await createAuthorizationCode(result.request, session.user.id);
  // Leaves the app for the connector's callback, so there's no revalidatePath
  // and no ?success= toast — the destination isn't ours to render.
  redirect(target);
}

export async function denyAuthorization(formData: FormData) {
  await requireAuth();

  const result = await validateAuthorizationRequest(requestParams(formData));
  if (!result.ok) {
    throw new Error(`Authorization request rejected: ${result.errorDescription}`);
  }

  redirect(
    buildErrorRedirect(
      result.request.redirectUri,
      "access_denied",
      "The user denied the authorization request.",
      result.request.state,
    ),
  );
}
