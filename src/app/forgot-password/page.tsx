import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Toast } from "@/components/Toast";
import { requestPasswordReset } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Reset your password
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Enter your email and we&apos;ll send you a link to choose a new password.
          </p>
        </div>

        <form action={requestPasswordReset} className="mt-8 space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Send reset link
          </button>
        </form>

        <p className="text-center text-sm">
          <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
