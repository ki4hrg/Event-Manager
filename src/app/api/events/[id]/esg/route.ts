import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { getEsgData, getPostEventReportData } from "@/app/events/reports/data";
import { parseEsgSearchParams } from "@/lib/esg/params";

// .docx / .xlsx downloads of the ESG and Post-Event Report — a binary stream,
// so a route handler rather than a Server Action. Authenticated only; share
// links get Print / Save PDF.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

type Format = keyof typeof MIME;

function filename(eventName: string, title: string, format: Format) {
  const base = `${eventName} - ${title}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  return `${base}.${format}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  await requirePermission("EVENTS", "VIEW", eventId);

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const format = sp.format;
  const doc = sp.doc ?? "esg";
  if (format !== "docx" && format !== "xlsx") return NextResponse.json({ error: "format must be docx or xlsx" }, { status: 400 });
  if (doc !== "esg" && doc !== "per") return NextResponse.json({ error: "doc must be esg or per" }, { status: 400 });

  let buffer: Buffer;
  let name: string;
  if (doc === "esg") {
    const data = await getEsgData(eventId, parseEsgSearchParams(sp));
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    buffer =
      format === "docx"
        ? await (await import("@/lib/esg/renderDocx")).renderEsgDocx(data.document)
        : await (await import("@/lib/esg/renderXlsx")).renderEsgXlsx(data.document);
    name = filename(data.document.meta.eventName, "Event Specifications Guide", format);
  } else {
    const per = await getPostEventReportData(eventId, { showBlank: sp.blank === "1" });
    if (!per) return NextResponse.json({ error: "Not found" }, { status: 404 });
    buffer =
      format === "docx"
        ? await (await import("@/lib/esg/renderDocx")).renderPerDocx(per)
        : await (await import("@/lib/esg/renderXlsx")).renderPerXlsx(per);
    name = filename(per.meta.eventName, "Post-Event Report", format);
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
