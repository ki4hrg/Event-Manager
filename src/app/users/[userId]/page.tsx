import { PermissionResource } from "@prisma/client";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { requirePermission } from "@/lib/permissions";
import { getUser, updateUser, deleteUser, resendPasswordResetEmail } from "../actions";
import { UserForm } from "../UserForm";
import { ResendInviteButton } from "../ResendInviteButton";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  const { userId } = await params;
  const { error } = await searchParams;
  const user = await getUser(userId);

  if (!user) {
    notFound();
  }

  const updateAction = async (formData: FormData) => {
    "use server";
    await updateUser(userId, formData);
  };

  const deleteAction = async () => {
    "use server";
    await deleteUser(userId);
  };

  const resendAction = async () => {
    "use server";
    await resendPasswordResetEmail(userId);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: user.name || user.email }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
          {user.name || user.email}
        </h1>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-800 dark:text-amber-300 text-sm">
          {error}
        </div>
      )}
      <UserForm
        user={user}
        saveAction={updateAction}
        deleteAction={deleteAction}
        currentUserId={session.user.id}
      />
      <div className="mt-6 bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Password
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Email the user a one-time link to choose or change their password. Sending invalidates any prior unused link.
        </p>
        <ResendInviteButton action={resendAction} />
      </div>
    </PageWrapper>
  );
}
