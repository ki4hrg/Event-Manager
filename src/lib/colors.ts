export const colorClasses: Record<string, string> = {
  gray: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  red: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
  orange: "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300",
  yellow: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300",
  green: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  blue: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  purple: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
  pink: "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300",
};

export const COLOR_OPTIONS = Object.keys(colorClasses) as Array<keyof typeof colorClasses>;
