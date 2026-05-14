"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export function Toast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const success = searchParams.get("success");
    if (success) {
      setMessage(success);
      requestAnimationFrame(() => setVisible(true));

      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      const target = url.searchParams.size > 0 ? url.toString() : url.pathname;
      router.replace(target, { scroll: false });

      const hideTimer = setTimeout(() => setVisible(false), 3000);
      const clearTimer = setTimeout(() => setMessage(null), 3300);
      return () => { clearTimeout(hideTimer); clearTimeout(clearTimer); };
    }
  }, [searchParams, router]);

  if (!message) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {message}
    </div>
  );
}
