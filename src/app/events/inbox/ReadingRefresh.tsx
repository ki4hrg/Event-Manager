"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 4_000;
// A read normally lands well inside this; past it (e.g. a restart left the
// item Received) polling stops and Re-read is the way on.
const GIVE_UP_MS = 3 * 60_000;

// Re-renders the page while a message is being read, so it lands as Ready or
// Failed without a manual reload.
export function ReadingRefresh({ label = "Reading…" }: { label?: string | null }) {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) {
        clearInterval(timer);
        setStalled(true);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  if (label == null) return null;
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300">
      {stalled ? "Still reading. Re-read if it doesn't land." : label}
    </p>
  );
}
