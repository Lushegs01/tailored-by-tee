import type { Metadata, Viewport } from "next";

import { siteConfig } from "@/config/site";
import { fontVariables } from "@/lib/fonts";

import "./globals.css";

/*
 * The document itself, and nothing else. Two very different interfaces sit
 * inside it: the storefront ((store), with its header, footer, bag and search)
 * and the admin area (/admin, its own operational frame). Neither one's chrome
 * or client state reaches the other.
 *
 * Titles, descriptions and social metadata belong to each area; only what is
 * true of every page in the document is set here.
 */

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: siteConfig.name,
  applicationName: siteConfig.name,
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
