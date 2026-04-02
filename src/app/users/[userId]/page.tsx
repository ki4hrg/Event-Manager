import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { requireAdmin } from "@/lib/auth";
import { getUser, updateUser, deleteUser } from "../actions";
import { UserForm } from "../UserForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await requireAdmin();
  const { userId } = await params;
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

  return (
    <PageWrapper>
      <div className="mb-6">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: user.name || user.email }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
          {user.name || user.email}
        </h1>
      </div>
      <UserForm
        user={user}
        saveAction={updateAction}
        deleteAction={deleteAction}
        currentUserId={session.user.id}
      />
    </PageWrapper>
  );
}
