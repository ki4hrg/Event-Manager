"use server";

// Public form actions. Deliberately auth-free (like the password-reset
// actions): every export is a public RPC endpoint callable with any
// arguments, so each one re-resolves the token itself and hands the cores
// the link — tenant, event and target always come from the link, never from
// the request. The draft is found by the HttpOnly cookie, never an argument.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HONEYPOT_FIELD } from "@/lib/forms/meta";
import {
  type ActiveFormLink,
  DRAFT_COOKIE,
  PublicFormError,
  draftCookieOptions,
  formRequestAllowed,
  getActiveFormLink,
} from "@/lib/forms/links";
import { clientIp } from "@/lib/rateLimit";
import {
  discardFormDraftCore,
  keepStaleAnswersCore,
  removeDraftFileCore,
  saveFormDraftCore,
  submitFormCore,
} from "@/lib/forms/publicCore";

async function resolve(token: unknown) {
  if (typeof token !== "string") redirect("/");
  const link = await getActiveFormLink(token);
  // The same response for unknown, revoked and expired: the page's
  // "isn't available" message.
  if (!link) redirect(`/f/${encodeURIComponent(token)}`);
  return link;
}

async function readDraftKey() {
  return (await cookies()).get(DRAFT_COOKIE)?.value;
}

// A filled honeypot is a bot: answer as if it worked and store nothing.
function isBot(formData: FormData) {
  const trap = formData.get(HONEYPOT_FIELD);
  return typeof trap === "string" && trap.length > 0;
}

// Runs a save or submit, returning where to send a refused one. A stale form
// keeps the answers as the draft (the page rebases them onto the current
// record); when they no longer fit, they're dropped as before.
async function run(link: ActiveFormLink, formData: FormData, work: () => Promise<void>): Promise<string | null> {
  try {
    await work();
    return null;
  } catch (err) {
    if (!(err instanceof PublicFormError)) throw err;
    if (err.code !== "stale") return `/f/${link.token}?error=${err.code}`;
    let key: string | null;
    try {
      key = await keepStaleAnswersCore(link, await readDraftKey(), formData);
    } catch (keepErr) {
      if (keepErr instanceof PublicFormError) return `/f/${link.token}?error=${keepErr.code}`;
      throw keepErr;
    }
    if (!key) return `/f/${link.token}?error=changed`;
    (await cookies()).set(DRAFT_COOKIE, key, draftCookieOptions(link.token));
    return `/f/${link.token}?error=stale`;
  }
}

export async function saveFormDraft(token: string, formData: FormData) {
  const link = await resolve(token);
  if (!formRequestAllowed(link.token, await clientIp())) redirect(`/f/${link.token}?error=busy`);
  if (!(formData instanceof FormData)) redirect(`/f/${link.token}?error=invalid`);
  if (isBot(formData)) redirect(`/f/${link.token}?saved=1`);
  const failed = await run(link, formData, async () => {
    const key = await saveFormDraftCore(link, await readDraftKey(), formData);
    (await cookies()).set(DRAFT_COOKIE, key, draftCookieOptions(link.token));
  });
  redirect(failed ?? `/f/${link.token}?saved=1`);
}

export async function submitForm(token: string, formData: FormData) {
  const link = await resolve(token);
  if (!formRequestAllowed(link.token, await clientIp())) redirect(`/f/${link.token}?error=busy`);
  if (!(formData instanceof FormData)) redirect(`/f/${link.token}?error=invalid`);
  if (isBot(formData)) redirect(`/f/${link.token}?submitted=1`);
  const failed = await run(link, formData, async () => {
    await submitFormCore(link, await readDraftKey(), formData);
    (await cookies()).delete({ name: DRAFT_COOKIE, path: `/f/${link.token}` });
  });
  redirect(failed ?? `/f/${link.token}?submitted=1`);
}

export async function discardFormDraft(token: string) {
  const link = await resolve(token);
  await discardFormDraftCore(link, await readDraftKey());
  (await cookies()).delete({ name: DRAFT_COOKIE, path: `/f/${link.token}` });
  redirect(`/f/${link.token}`);
}

export async function removeFormDraftFile(token: string, fileId: string) {
  const link = await resolve(token);
  if (typeof fileId !== "string") return;
  await removeDraftFileCore(link, await readDraftKey(), fileId);
}
