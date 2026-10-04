import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "./globals.css";
import "./site.css";

export const metadata: Metadata = {
  title: { default: "MySailingStats — the global sailing search", template: "%s · MySailingStats" },
  description:
    "Search regattas, sailors, boats, coaches and clubs worldwide. Results from Clubspot and Regatta Network, with ratings, comparisons and club team results.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a2a66" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
