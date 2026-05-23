import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { getEmailConfigStatus, isEmailConfigured } from "@/lib/email";
import { sendTestEmailAction } from "./actions";
import { SendTestEmailForm } from "./SendTestEmailForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Email" };

export default async function SystemEmailPage() {
  const session = await requirePermission(PermissionResource.SYSTEM, "VIEW");
  const status = getEmailConfigStatus();
  const configured = isEmailConfigured();

  const rowClass = "flex justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0";
  const labelClass = "text-sm text-gray-500 dark:text-gray-400";
  const valueClass = "text-sm text-gray-900 dark:text-white font-mono break-all text-right";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Mailgun configuration</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Values come from environment variables. Restart the app after editing them.
        </p>
        <div className="mt-4 max-w-2xl bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <div className={rowClass}>
            <span className={labelClass}>API key</span>
            <span className={valueClass}>
              {status.apiKeySet ? (
                <span className="text-green-700 dark:text-green-400">set</span>
              ) : (
                <span className="text-red-700 dark:text-red-400">missing</span>
              )}
            </span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>Domain</span>
            <span className={valueClass}>
              {status.domain ?? <span className="text-red-700 dark:text-red-400">missing</span>}
            </span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>From address</span>
            <span className={valueClass}>
              {status.from ?? <span className="text-red-700 dark:text-red-400">missing</span>}
            </span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>API base URL</span>
            <span className={valueClass}>{status.baseUrl}</span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>App base URL (for links)</span>
            <span className={valueClass}>{status.appBaseUrl}</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Send test email</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Sends a one-off message via Mailgun. Use this after editing the env vars to confirm delivery.
        </p>
        <div className="mt-4 max-w-2xl bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          {!configured && (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-800 dark:text-amber-300 text-sm">
              Mailgun is not fully configured. Set the missing values above before sending.
            </div>
          )}
          <SendTestEmailForm
            action={sendTestEmailAction}
            defaultTo={session.user.email ?? ""}
            disabled={!configured}
          />
        </div>
      </section>
    </div>
  );
}
