import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Manager",
  description: "Internal tool for managing conferences and events",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 dark:bg-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
