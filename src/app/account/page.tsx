import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { PageWrapper } from "@/components/PageWrapper";
import { Toast } from "@/components/Toast";
import { getUserLandingPage } from "@/lib/userSettings";
import { updateLandingPage } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireAuth();
  const landingPage = await getUserLandingPage(session.user.id);

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>

      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        Account
      </h1>

      <div className="max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-medium text-gray-900 dark:text-white mb-4">
            Preferences
          </h2>

          <form action={updateLandingPage} className="space-y-4">
            <div>
              <label
                htmlFor="landing_page"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Default landing page
              </label>
              <select
                id="landing_page"
                name="landing_page"
                defaultValue={landingPage}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="dashboard">Dashboard</option>
                <option value="events">Events list</option>
                <option value="last_event">Last event viewed</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Where to go after signing in or clicking the logo.
              </p>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Save
            </button>
          </form>
        </div>

        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Signed in as {session.user.email}
        </div>
      </div>
    </PageWrapper>
  );
}
