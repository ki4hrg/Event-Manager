type Props = {
  message: string;
};

export function EmptyState({ message }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
      <p className="text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}
