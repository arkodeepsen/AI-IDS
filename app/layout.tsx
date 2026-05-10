import type { Metadata } from "next";
import "./globals.css";
import LiveToasts from "@/components/LiveToasts";

// Using system stack instead of next/font/google so the project builds offline.
// Swap back to Geist whenever an internet connection is available during build.

export const metadata: Metadata = {
  title: "AI-IDS — Intrusion Detection Dashboard",
  description:
    "Real-time AI-driven intrusion detection with ensemble ML, Active Learning and autonomous response.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <LiveToasts />
      </body>
    </html>
  );
}
