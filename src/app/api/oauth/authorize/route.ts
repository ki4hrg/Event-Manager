import { auth } from "@/lib/auth";
import {
  authorizationRequestQuery,
  buildErrorRedirect,
  validateAuthorizationRequest,
} from "@/lib/mcpOAuth";

// OAuth 2.1 authorization endpoint (GET only). It does no UI of its own: it
// validates the request, then hands the browser to the authenticated approval
// page at /oauth/authorize, bouncing through the normal NextAuth /login flow
// first when there's no session. The approval page's Server Action is what
// actually mints the code, so there's no second password prompt here and the
// user's existing session is the credential.

// Relative Location rather than an absolute URL: the app sits behind a reverse
// proxy in every deployment, so reconstructing our own origin risks sending the
// browser to the internal host. Same-origin redirects don't need one.
function redirectTo(location: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

function errorPage(error: string, description: string) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>Authorization error</title></head>` +
      `<body style="font-family:system-ui,sans-serif;padding:40px;max-width:32rem;margin:0 auto">` +
      `<h1 style="font-size:1.25rem">Authorization error</h1>` +
      `<p><strong>${esc(error)}</strong></p><p>${esc(description)}</p></body></html>`,
    {
      status: 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await validateAuthorizationRequest(url.searchParams);

  if (!result.ok) {
    // Report back to the client only when redirect_uri is one it registered;
    // otherwise the error has to be shown to the person in the browser.
    if (result.redirectUri) {
      return redirectTo(
        buildErrorRedirect(
          result.redirectUri,
          result.error,
          result.errorDescription,
          result.state,
        ),
      );
    }
    return errorPage(result.error, result.errorDescription);
  }

  const approvalPath = `/oauth/authorize?${authorizationRequestQuery(result.request)}`;

  const session = await auth();
  if (!session?.user?.id) {
    return redirectTo(`/login?callbackUrl=${encodeURIComponent(approvalPath)}`);
  }

  return redirectTo(approvalPath);
}
