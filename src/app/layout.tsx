import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { StoreProvider } from "@/components/StoreProvider";

import "./globals.css";

/** Mirrors `next.config.ts` — static export on GitHub Pages uses this subpath prefix. */
const assetPrefix = process.env.GITHUB_PAGES_BASE_PATH?.trim() ?? "";

function withAssetPrefix(path: string): string {
  return `${assetPrefix}${path}`;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  title: "Anki2",
  description: "Spaced repetition web client",
  manifest: withAssetPrefix("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Anki2",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      {
        url: withAssetPrefix("/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: withAssetPrefix("/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: withAssetPrefix("/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
