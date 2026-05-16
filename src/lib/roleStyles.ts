export function roleBadgeClass(roleName: string | null | undefined) {
  return `px-2 py-0.5 text-xs rounded ${
    roleName === "Admin"
      ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
  }`;
}
