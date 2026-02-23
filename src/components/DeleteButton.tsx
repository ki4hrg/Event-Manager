"use client";

type DeleteButtonProps = {
  action: () => Promise<void>;
  label?: string;
  confirmMessage?: string;
};

export function DeleteButton({
  action,
  label = "Delete",
  confirmMessage = "Are you sure you want to delete this?",
}: DeleteButtonProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirm(confirmMessage)) {
      await action();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <button
        type="submit"
        className="px-4 py-2 text-red-600 border border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        {label}
      </button>
    </form>
  );
}
