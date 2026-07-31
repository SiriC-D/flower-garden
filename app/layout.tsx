import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://flower-garden-kappa.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Flower Garden 🌸 | Real-Time Collaborative Canvas",
  description:
    "Plant a flower and watch it bloom live for everyone. A real-time collaborative garden built with Next.js, Supabase Realtime, and the HTML5 Canvas API.",
  openGraph: {
    title: "Flower Garden 🌸",
    description:
      "A real-time collaborative canvas — plant a flower and watch the garden grow live with everyone else online.",
    url: SITE_URL,
    siteName: "Flower Garden",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flower Garden 🌸",
    description:
      "A real-time collaborative canvas — plant a flower and watch the garden grow live.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#66BB6A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
