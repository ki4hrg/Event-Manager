import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { btnPrimary } from "@/lib/buttonStyles";
import { compareFunctionNumbers, formatFunctionLabel } from "@/lib/functionNumbers";
import { getEvent } from "../../actions";
import { getExhibitBooths } from "../../exhibits/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exhibits" };

export default async function ExhibitsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, booths] = await Promise.all([getEvent(eventId), getExhibitBooths(eventId)]);
  if (!event) notFound();

  // Group by exhibit function; booths in natural booth-number order.
  const groups = new Map<string, { label: string; number: string | null; booths: typeof booths }>();
  for (const b of booths) {
    const key = b.function?.id ?? "";
    const g = groups.get(key) ?? {
      label: b.function ? formatFunctionLabel(b.function) : "Not linked to a function",
      number: b.function?.functionNumber ?? null,
      booths: [],
    };
    g.booths.push(b);
    groups.set(key, g);
  }
  const ordered = Array.from(groups.entries()).sort(([ka, a], [kb, b]) =>
    ka === "" ? 1 : kb === "" ? -1 : compareFunctionNumbers(a.number, b.number) || a.label.localeCompare(b.label),
  );
  const boothOrder = (a: (typeof booths)[number], b: (typeof booths)[number]) =>
    (a.boothNumber ?? "").localeCompare(b.boothNumber ?? "", undefined, { numeric: true }) || a.name.localeCompare(b.name);

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Exhibits" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Exhibits ({booths.length})</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            One Booth Set-up Order (ESG Part IIIb) per booth.
          </p>
        </div>
        <Link href={`/events/${eventId}/exhibits/new`} className={`${btnPrimary} text-sm self-start sm:self-auto`}>
          Add Booth
        </Link>
      </div>

      {booths.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No booths yet.</p>
      ) : (
        <div className="space-y-6">
          {ordered.map(([key, g]) => (
            <section key={key || "none"}>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{g.label}</h2>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {[...g.booths].sort(boothOrder).map((b) => (
                  <Link
                    key={b.id}
                    href={`/events/${eventId}/exhibits/${b.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-blue-600 dark:text-blue-400">
                        {b.boothNumber && <span className="text-gray-500 dark:text-gray-400 mr-2">Booth {b.boothNumber}</span>}
                        {b.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {[b.companyName, b.boothType, b.location].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {b.contact ? `${b.contact.firstName} ${b.contact.lastName}` : ""}
                      {b._count.equipmentItems > 0 ? ` · ${b._count.equipmentItems} inventory item(s)` : ""}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
