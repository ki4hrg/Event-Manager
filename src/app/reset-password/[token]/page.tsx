import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { consumePasswordResetToken } from "@/lib/email";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await consumePasswordResetToken(token);
  if (!valid) notFound();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Choose a password
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Set the password you&apos;ll use to sign in to Event Manager.
          </p>
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
