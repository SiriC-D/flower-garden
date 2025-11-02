import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flower Garden 🌸",
  description: "A cute interactive flower garden built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* ✅ Make the app scale properly on phones */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* ✅ Comic Sans font from Google Fonts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          fontFamily: '"Comic Neue", "Comic Sans MS", cursive',
          backgroundColor: "#F0F4C3",
          color: "#2E7D32",
        }}
      >
        {children}
      </body>
    </html>
  );
}
