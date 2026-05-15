import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { createUser } from "../actions";
import { UserForm } from "../UserForm";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  return (
    <PageWrapper>
      <div className="mb-6">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: "New User" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
          New User
        </h1>
      </div>
      <UserForm saveAction={createUser} />
    </PageWrapper>
  );
}
