import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getUser, updateUser, deleteUser, resendPasswordResetEmail } from "../actions";
import { getRoleOptions } from "@/app/users/roles/actions";
import { UserForm } from "../UserForm";
import { ResendInviteButton } from "../ResendInviteButton";
import { notFound } from "next/navigation";
import { LastUpdated } from "@/components/LastUpdated";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  return { title: user?.name || user?.email || "User" };
}

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
  const [user, roles] = await Promise.all([getUser(userId), getRoleOptions()]);

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
    <div>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: user.name || user.email }]} />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">
          {user.name || user.email}
        </h2>
        <div className="mt-1">
          <LastUpdated updatedAt={user.updatedAt} updatedBy={user.updatedBy} />
        </div>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-800 dark:text-amber-300 text-sm">
          {error}
        </div>
      )}
      <UserForm
        user={user}
        roles={roles}
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
    </div>
  );
}
