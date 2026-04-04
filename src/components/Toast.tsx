"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export function Toast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const success = searchParams.get("success");
    if (success) {
      setMessage(success);
      // Remove the query param from URL without refresh
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      const target = url.searchParams.size > 0 ? url.toString() : url.pathname;
      router.replace(target, { scroll: false });

      // Auto-hide after 3 seconds
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg">
      {message}
    </div>
  );
}
