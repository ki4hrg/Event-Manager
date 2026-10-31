import { Suspense } from "react";
import { Toast } from "@/components/Toast";
import { LoginForm } from "./LoginForm";

// Unauthenticated, so no force-dynamic (see docs/ARCHITECTURE.md § Pages and routing). The
// form is split out because it reads ?callbackUrl= via useSearchParams, which
// has to sit under a Suspense boundary.
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Event Manager
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to your account
          </p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
