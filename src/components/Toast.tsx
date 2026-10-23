"use client";

import { startTransition, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export function Toast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const success = searchParams.get("success");
    if (success) {
      startTransition(() => setMessage(success));

      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      const target = url.searchParams.size > 0 ? url.toString() : url.pathname;
      router.replace(target, { scroll: false });
    }
  }, [searchParams, router]);

  // Keyed on the message, not the URL: the replace above re-runs that effect,
  // and its cleanup would cancel these and leave the toast up.
  useEffect(() => {
    if (!message) return;
    const showFrame = requestAnimationFrame(() => setVisible(true));
    const hideTimer = setTimeout(() => setVisible(false), 3000);
    const clearTimer = setTimeout(() => setMessage(null), 3300);
    return () => { cancelAnimationFrame(showFrame); clearTimeout(hideTimer); clearTimeout(clearTimer); };
  }, [message]);

  if (!message) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-md z-50 break-words bg-green-600 dark:bg-green-700 text-white px-4 py-2 rounded-md shadow-lg transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {message}
    </div>
  );
}
