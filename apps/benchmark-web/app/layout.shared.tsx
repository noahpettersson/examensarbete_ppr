import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPR Thesis Benchmark",
  description:
    "Controlled benchmark instrument comparing SSG, SSR, and PPR rendering strategies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
