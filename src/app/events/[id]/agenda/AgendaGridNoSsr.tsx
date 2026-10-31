"use client";

import dynamic from "next/dynamic";

// Next 15+ only allows `ssr: false` inside a Client Component, so the
// client-only load of AgendaGrid lives here rather than in the page.
export const AgendaGrid = dynamic(() => import("./AgendaGrid").then((m) => m.AgendaGrid), { ssr: false });
