import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { DRAFT_COOKIE, PublicFormError, draftCookieOptions, getActiveFormLink } from "@/lib/forms/links";
import { attachPublicUploadCore } from "@/lib/forms/publicCore";
import { PUBLIC_UPLOAD_MAX_BYTES } from "@/lib/uploads";

// Public form upload: a route handler because Server Actions can't take a
// streamed multipart body of this size. Public by the /f/ prefix in the
// authorized callback; the token and the draft cookie are the only access.
// Server Actions get Next's Origin check for free, this handler does not, so
// it checks Origin itself.

// Room for the multipart envelope around one file.
const MAX_BODY_BYTES = PUBLIC_UPLOAD_MAX_BYTES + 64 * 1024;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!sameOrigin(request)) return NextResponse.json({ error: "upload" }, { status: 403 });

  // Refuse oversized bodies before buffering them.
  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "upload" }, { status: 413 });
  }

  const link = await getActiveFormLink(token);
  if (!link) return NextResponse.json({ error: "closed" }, { status: 404 });

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const value = formData.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "upload" }, { status: 400 });

  try {
    const cookieStore = await cookies();
    const result = await attachPublicUploadCore(link, cookieStore.get(DRAFT_COOKIE)?.value, file);
    cookieStore.set(DRAFT_COOKIE, result.draftKey, draftCookieOptions(link.token));
    return NextResponse.json({ file: result.file });
  } catch (err) {
    if (err instanceof PublicFormError) {
      return NextResponse.json({ error: err.code }, { status: err.code === "busy" ? 429 : 400 });
    }
    return NextResponse.json({ error: "upload" }, { status: 500 });
  }
}
