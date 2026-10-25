import { NextRequest, NextResponse } from "next/server";
import { getRfpComparison, getRfpDocument } from "@/app/events/rfps/actions";
import { getQuoteComparison } from "@/app/events/quotes/actions";
import { prisma } from "@/lib/prisma";
import { COMBINE_PARAM, parseCombine } from "@/lib/rfp/compare";

// .docx downloads of an RFP document (?doc=rfp, the default) and its
// proposal or quote comparison (?doc=compare) — a binary stream, so a route
// handler rather than a Server Action. Both readers check the kind's permission (VIEW on the
// event) before reading anything.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  const sp = request.nextUrl.searchParams;
  if (sp.get("format") !== "docx") return NextResponse.json({ error: "format must be docx" }, { status: 400 });
  const kind = sp.get("doc") ?? "rfp";
  if (kind !== "rfp" && kind !== "compare") return NextResponse.json({ error: "doc must be rfp or compare" }, { status: 400 });

  const render = await import("@/lib/rfp/renderDocx");
  let buffer: Buffer;
  let name: string;
  if (kind === "rfp") {
    const doc = await getRfpDocument(rfpId, eventId);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    buffer = await render.renderRfpDocx(doc);
    name = render.rfpFileName(doc.meta.eventName, doc.meta.title);
  } else if ((await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } }))?.kind !== "HOTEL") {
    // Vendor RFPs compare quotes; the reader checks the kind's permission.
    const data = await getQuoteComparison(rfpId, eventId);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    buffer = await render.renderQuoteCompareDocx(data);
    name = render.rfpFileName(data.eventName, `${data.title} - Quote comparison`);
  } else {
    const data = await getRfpComparison(rfpId, eventId, parseCombine(sp.get(COMBINE_PARAM) ?? undefined));
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    buffer = await render.renderRfpCompareDocx(data);
    name = render.rfpFileName(data.eventName, `${data.title} - Proposal comparison`);
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
